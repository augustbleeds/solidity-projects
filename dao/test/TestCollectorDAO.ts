import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, network } from "hardhat";
import { CollectorDAO, CollectorDAO__factory, Greeter, Greeter__factory } from "../typechain";
import CollectorDaoJSON from "../artifacts/contracts/CollectorDAO.sol/CollectorDAO.json";
import GreeterJSON from "../artifacts/contracts/Greeter.sol/Greeter.json";
import { Interface, splitSignature } from "ethers/lib/utils";

const ONE_ETHER = ethers.utils.parseEther("1");
const ONE_MINUTE = 60;
const ONE_HOUR = ONE_MINUTE*60;
const ONE_DAY = ONE_HOUR*24;

const PROPOSAL = {
  ACTIVE: 0, 
  CANCELLED: 1,
  VOTE_PASSED: 2,
  VOTE_FAILED: 3,
  EXECUTED: 4
}

// Bump the timestamp by a specific amount of seconds
const timeTravel = async (seconds: number) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  // https://hardhat.org/hardhat-network/reference#evm_mine
  await network.provider.send("evm_mine");
};

const getTimestamp = async () => {
  // getting timestamp
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  return blockBefore.timestamp;
}

describe("CollectorDAO", () => {
  let deployer: SignerWithAddress;
  let member1: SignerWithAddress;
  let member2: SignerWithAddress;
  let member3: SignerWithAddress;
  let member4: SignerWithAddress;
  let member5: SignerWithAddress;
  let nonMember: SignerWithAddress;
  let users: SignerWithAddress[];

  let daoFactory: CollectorDAO__factory;
  let dao: CollectorDAO;
  let daoInterface: Interface;

  let greeterFactory: Greeter__factory;
  let greeter: Greeter;
  let greeterInterface: Interface;

  let domain: {name: string, chainId: number, version: string, verifyingContract: string};
  let types: {CastVote: {name: string, type: string}[]};

  let goodMarketAddress: string;


  beforeEach(async () => {
    [deployer, member1, member2, member3, member4, member5, nonMember, ...users] = await ethers.getSigners();

    daoFactory = await ethers.getContractFactory("CollectorDAO");

    const goodMarketFactory = await ethers.getContractFactory("GoodMarketplace");
    const goodMarket = await goodMarketFactory.deploy();
    await goodMarket.deployed();
    goodMarketAddress = goodMarket.address;

    dao = await daoFactory.deploy(goodMarket.address);
    // console.log(await dao.market(), 'market');

    for(let member of [member1, member2, member3, member4, member5]) {
      await dao.connect(member).buyMembership({value: ONE_ETHER});
    }

    greeterFactory = await ethers.getContractFactory("Greeter");
    greeter = await greeterFactory.deploy("Hi");
    await greeter.deployed();

    daoInterface = new ethers.utils.Interface(CollectorDaoJSON.abi);
    greeterInterface = new ethers.utils.Interface(GreeterJSON.abi);

    domain = {
      name: "CollectorDAOByAugust",
      version: '1',
      chainId: network.config.chainId!,
      verifyingContract: dao.address
    }
    types = {
      CastVote: [
        { name: "proposalId", type: "uint256"},
        { name: "support", type: "uint8"}
      ]
    }
  });

  describe("Deployment", () => {

    it("Instantiates with NFT marketplace", async () => {
      expect(await dao.market()).to.be.ok;
    });

    it("buyNFT fails if someone besides CollectorDAO calls it", async () => {
      await expect(dao.buyNFT(1, nonMember.address, 0))
        .to.be.revertedWith("ONLY_DAO");
    });
  });

  describe("Member Management", () => {

    it("Anyone can buy membership for 1 ETH", async () => {
      expect(await dao.isMember(member1.address)).to.equal(true);
    });

    it("Buying membership fails if < 1 ETH", async () => {
      await expect(dao.connect(nonMember).buyMembership({value: ONE_ETHER.div(2) }))
        .to.be.revertedWith("REGISTRATION_FAILED");
    });

    it("Buying membership fails if > 1 ETH", async () => {
      await expect(dao.connect(nonMember).buyMembership({value: ONE_ETHER.mul(2) }))
        .to.be.revertedWith("REGISTRATION_FAILED");
    });

    it("Member cannot buy another membership", async () => {
      await expect(dao.connect(member1).buyMembership({value: ONE_ETHER}))
        .to.be.revertedWith("REGISTRATION_FAILED");
    });

  });

  describe("Create Proposal", () => {

    it("Member can create a proposal", async () => {
      const callData = greeterInterface.encodeFunctionData("greet");
      await dao.connect(member1).propose([greeter.address], [ONE_ETHER], [callData], "Get greeting", ONE_DAY, ONE_DAY*2);

      const events = await dao.queryFilter(dao.filters.ProposalCreated());

      const [
        actualProposer, 
        actualId,
        actualTargets,
        actualValues, 
        actualCallData, 
        actualDescription, 
        actualVoteDuration, 
        actualMinExecutionlag
      ] = events[0].args;

      expect(actualProposer).to.equal(member1.address);
      expect(actualId).to.be.ok;
      expect(actualTargets).to.deep.equal([greeter.address]);
      expect(actualValues).to.deep.equal([ONE_ETHER]);
      expect(actualCallData).to.deep.equal([callData]);
      expect(actualDescription).to.equal("Get greeting");
      expect(actualVoteDuration).to.equal(ONE_DAY);
      expect(actualMinExecutionlag).to.equal(ONE_DAY*2);
    });

    it("Non-members cannot create a proposal", async () => {
      const callData = greeterInterface.encodeFunctionData("greet");
      await expect(dao.connect(nonMember).propose([greeter.address], [ONE_ETHER], [callData], "Get greeting", ONE_DAY, ONE_DAY*2))
        .to.be.revertedWith("ONLY_MEMBER");
    });

    it("Same proposal cannot be created twice", async () => {
      const callData = greeterInterface.encodeFunctionData("greet");
      await dao.connect(member1).propose([greeter.address], [ONE_ETHER], [callData], "Get greeting", ONE_DAY, ONE_DAY*2);

      // proposal id is not dependent on the vote duration or min exectuion lag
      await expect(dao.connect(member1).propose([greeter.address], [ONE_ETHER], [callData], "Get greeting", ONE_DAY*2, ONE_DAY*2))
      .to.be.revertedWith("ALREADY_EXISTS");
    });


    it("Fails if proposal arguments cannot be matched together", async () => {
      const callData = greeterInterface.encodeFunctionData("greet");
      await expect(dao.connect(member1).propose([greeter.address], [ONE_ETHER], [callData, callData], "Get greeting", ONE_DAY, ONE_DAY*2))
        .to.be.revertedWith("INVALID_ARGUMENT");
    });
 

  });

  describe("Proposal Status", () => {

    let proposalId: BigNumber;

    beforeEach(async () => {
      const callData = greeterInterface.encodeFunctionData("greet");
      await dao.connect(member1).propose([greeter.address], [ONE_ETHER], [callData], "Get greeting", ONE_DAY, ONE_DAY*2);
      const events = await dao.queryFilter(dao.filters.ProposalCreated());
      const [ , myProposalId, ..._] = events[0].args;
      proposalId = myProposalId;
    })

    it("Reverts if proposal id is invalid", async () => {
      await expect(dao.status(123)).to.be.revertedWith("PROPOSAL_NOT_FOUND");
    });


    it("Anyone can get the status of a proposal", async () => {
      expect(await dao.connect(nonMember).status(proposalId)).to.equal(PROPOSAL.ACTIVE);
    });

    it("Status is failed without quorum", async () => {
      await dao.connect(member3).castVote(proposalId, 1);
      await timeTravel(ONE_DAY+ONE_HOUR);

      expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_FAILED);
    });

    // todo: try quorum when there are less members

    it("Status is failed with quorum and equal or greater against votes", async () => {
      await dao.connect(member1).castVote(proposalId, 0);
      await dao.connect(member3).castVote(proposalId, 1);

      await timeTravel(ONE_DAY*2);

      let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);
      expect(forVotes).to.equal(1);
      expect(againstVotes).to.equal(1);
      expect(abstainVotes).to.equal(0);

      expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_FAILED);

    });

    it("Status is passed with greater for votes", async () => {
      await dao.connect(member1).castVote(proposalId, 0);
      await dao.connect(member2).castVote(proposalId, 1);
      await dao.connect(member3).castVote(proposalId, 1);

      await timeTravel(ONE_DAY*2);
      
      let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);
      expect(forVotes).to.equal(2);
      expect(againstVotes).to.equal(1);
      expect(abstainVotes).to.equal(0);

      expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_PASSED);
    });

    // todo
    it("Status is passed with greater for votes and quorum met via abstain vote", async () => {

    });

    it("Status is failed with only abstain votes with quorum", async () => {
      await dao.connect(member1).castVote(proposalId, 2);
      await dao.connect(member2).castVote(proposalId, 2);


      let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);
      expect(forVotes).to.equal(0);
      expect(againstVotes).to.equal(0);
      expect(abstainVotes).to.equal(2);

      await timeTravel(ONE_DAY*2);

      expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_FAILED);

    });

    // TODO
    it("Status is executed after proposal is executed", async () => {

    });

  });

  describe("Proposal Cancellation", () => {

    let firstProposalId: BigNumber;

    beforeEach(async () => {
      const callData = greeterInterface.encodeFunctionData("greet");
      await dao.connect(member1).propose([greeter.address], [ONE_ETHER], [callData], "Get greeting", ONE_DAY, ONE_DAY*2);

      const events = await dao.queryFilter(dao.filters.ProposalCreated());

      const [ , actualId, ..._] = events[0].args;

      firstProposalId = actualId;

      for(let member of [member1, member2, member3,  member4, member5]) {
        await dao.connect(member).castVote(firstProposalId, 1);
      }

      const p = await dao.proposals(firstProposalId)

      const timestamp = await getTimestamp();
      expect(p[0]).to.equal(actualId);
      expect(p[1]).to.equal(5);
      expect(p[2]).to.equal(0);
      expect(p[3]).to.equal(0);
      expect(p[4]).to.equal(member1.address);
      expect(p[5]).to.be.closeTo(BigNumber.from(timestamp + ONE_DAY), ONE_MINUTE);
      expect(p[6]).to.equal(ONE_DAY*2);
      expect(p[7]).to.equal("Get greeting")
      expect(p[8]).to.equal(false);
      expect(p[9]).to.equal(false);
      expect(p[10]).to.equal(true);

      await timeTravel(ONE_DAY+ONE_HOUR);
      // proposal is passed
      expect(await dao.status(firstProposalId)).to.equal(PROPOSAL.VOTE_PASSED);
    });

    it("Cancelling successfuly passed proposal is allowed", async () => {
      // create cancellation proposal
      const callData = daoInterface.encodeFunctionData("cancelProposal", [firstProposalId]);
      await dao.connect(member2).propose([dao.address], [0], [callData], "Cancel first proposal", ONE_DAY, ONE_MINUTE);
      const events = await dao.queryFilter(dao.filters.ProposalCreated());
      const [ , secondProposalId, ..._] = events[1].args;

      // check cancelProposal is ACTIVE
      expect(await dao.status(secondProposalId)).to.equal(PROPOSAL.ACTIVE);
      
      for(let member of [member1, member2, member3,  member4, member5]) {
        await dao.connect(member).castVote(secondProposalId, 1);
      }

      // pass vote ending and pass min execution delay of cancellation proposal
      await timeTravel(ONE_DAY + ONE_HOUR);

      // check cancelProposal status is PASSED
      expect(await dao.status(secondProposalId)).to.equal(PROPOSAL.VOTE_PASSED);
    
      // execute cancellation
      await expect(dao.execute([dao.address], [0], [callData], "Cancel first proposal"))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(secondProposalId, true);
      
      // check proposal was cancelled
      const cancelEvents = await dao.queryFilter(dao.filters.ProposalCancelled());
      expect(cancelEvents[0].args).to.deep.equal([firstProposalId]);
      expect(await dao.status(firstProposalId)).to.equal(PROPOSAL.CANCELLED);
    });


    it("Cancelling proposal that cannot be cancelled fails (but second proposal succeeds)", async () => {
      // pass min execution delay
      await timeTravel(ONE_DAY*2+ONE_HOUR);
      // excute first proposal
      await expect(dao.execute([greeter.address], [ONE_ETHER], [greeterInterface.encodeFunctionData("greet")], "Get greeting"))
      .to.emit(dao, "ProposalExecuted")

      expect(await dao.status(firstProposalId)).to.equal(PROPOSAL.EXECUTED);

      // create cancellation proposal
      const callData = daoInterface.encodeFunctionData("cancelProposal", [firstProposalId]);
      await dao.connect(member2).propose([dao.address], [0], [callData], "Cancel first proposal", ONE_DAY, ONE_MINUTE);
      const events = await dao.queryFilter(dao.filters.ProposalCreated());
      const [ , secondProposalId, ..._] = events[1].args;

      // check cancelProposal is ACTIVE
      expect(await dao.status(secondProposalId)).to.equal(PROPOSAL.ACTIVE);
      
      for(let member of [member1, member2, member3,  member4, member5]) {
        await dao.connect(member).castVote(secondProposalId, 1);
      }

      // pass vote ending and pass min execution delay of cancellation proposal
      await timeTravel(ONE_DAY + ONE_HOUR);

      // check cancelProposal status is PASSED
      expect(await dao.status(secondProposalId)).to.equal(PROPOSAL.VOTE_PASSED);
    
      // execute cancellation proposal but it fails
      await expect(dao.execute([dao.address], [0], [callData], "Cancel first proposal"))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(secondProposalId, false);

      expect(await dao.status(secondProposalId)).to.equal(PROPOSAL.EXECUTED);
      
      expect(await dao.status(firstProposalId)).to.equal(PROPOSAL.EXECUTED);
    });

    it("Reverts if user attempts to cancel contract directly", async () => {
      await expect(dao.connect(member1).cancelProposal(234))
        .to.be.revertedWith("ONLY_DAO");
    });
  });

  // proposal active technically

  describe("Proposal Management", () => {

    const signVote = async (user: SignerWithAddress, proposalId: BigNumber, support: number):
    Promise<{v: number, r: string, s: string}> =>  {
      const value = {proposalId, support };
      const rawSignature = await user._signTypedData(domain, types, value);

      const recoveredAddress = ethers.utils.verifyTypedData(domain, types, value, rawSignature)
      await expect(recoveredAddress).to.equal(user.address);

      const {v, r, s} = splitSignature(rawSignature);
      return {v, r, s};
  }

    let proposalId: BigNumber;

    beforeEach(async () => {
      const callData = greeterInterface.encodeFunctionData("greet");
      await dao.connect(member1).propose([greeter.address], [ONE_ETHER], [callData], "Get greeting", ONE_DAY, ONE_DAY*2);
      
      const events = await dao.queryFilter(dao.filters.ProposalCreated());
      
      const [ , _proposalId, ..._] = events[0].args;

      proposalId = _proposalId;
    });

    describe("Self-voting", () => {

      it("Non-member cannot vote", async () => {
        await expect(dao.connect(nonMember).castVote(proposalId, 0))
          .to.be.revertedWith("ONLY_MEMBER");
      });

      it("Member can vote against active proposal", async () => {
        await dao.connect(member1).castVote(proposalId, 0);
        
        let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);

        expect(forVotes).to.equal(0);
        expect(abstainVotes).to.equal(0);
        expect(againstVotes).to.equal(1);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);
      });

      it("Member can vote for active proposal", async () => {
        await dao.connect(member1).castVote(proposalId, 1);
        
        let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);

        expect(forVotes).to.equal(1);
        expect(abstainVotes).to.equal(0);
        expect(againstVotes).to.equal(0);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);
      });

      it("Member can vote abstain for active proposal", async () => {
        await dao.connect(member1).castVote(proposalId, 2);
        
        let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);

        expect(forVotes).to.equal(0);
        expect(abstainVotes).to.equal(1);
        expect(againstVotes).to.equal(0);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);
      });

      it("Member cannot vote on non-active proposal", async () => {
        await timeTravel(ONE_DAY*2);
        // vote fails cuz there's no quorum 

        await expect(dao.connect(member1).castVote(proposalId, 0))
          .to.be.revertedWith("VOTE_NOT_ACCEPTED");
      });

      it("Member cannot vote with an invalid support number", async () => {
        await expect(dao.connect(member1).castVote(proposalId, 3))
          .to.be.revertedWith("VOTE_NOT_ACCEPTED");
      });

      it("Member cannot vote more than once", async () => {
        await dao.connect(member1).castVote(proposalId, 2);
        await expect(dao.connect(member1).castVote(proposalId, 1))
          .to.be.revertedWith("VOTE_NOT_ACCEPTED");
      });

    });

    describe("Vote by Signature - Single", () => {

      it("Non-member cannot vote", async () => {
        const {v, r, s} = await signVote(nonMember, proposalId, 0);

        await expect(dao.connect(nonMember).castVoteBySig(nonMember.address, proposalId, 0, v, r, s))
          .to.be.revertedWith("VOTE_NOT_ACCEPTED");
      });

      it("Member can vote against active proposal", async () => {
        const {v, r, s} = await signVote(member1, proposalId, 0);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);

        await dao.connect(nonMember).castVoteBySig(member1.address, proposalId, 0, v, r, s);

        let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);

        expect(forVotes).to.equal(0);
        expect(abstainVotes).to.equal(0);
        expect(againstVotes).to.equal(1);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);
      });

      it("Member can vote for active proposal", async () => {
        const {v, r, s} = await signVote(member1, proposalId, 1);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);

        await dao.connect(nonMember).castVoteBySig(member1.address, proposalId, 1, v, r, s);

        let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);

        expect(forVotes).to.equal(1);
        expect(abstainVotes).to.equal(0);
        expect(againstVotes).to.equal(0);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);
      });

      it("Member can vote abstain for active proposal", async () => {
        const {v, r, s} = await signVote(member1, proposalId, 2);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);

        await dao.connect(nonMember).castVoteBySig(member1.address, proposalId, 2, v, r, s);

        let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);

        expect(forVotes).to.equal(0);
        expect(abstainVotes).to.equal(1);
        expect(againstVotes).to.equal(0);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);
      });

      it("Reverts if address is not same as claim", async () => {
        const {v, r, s} = await signVote(member1, proposalId, 2);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);

        // purposelly claim it's someone else's signature
        await expect(dao.connect(nonMember).castVoteBySig(member2.address, proposalId, 2, v, r, s))
          .to.be.revertedWith("INVALID_SIGNATURE");
      });

      it("Member cannot vote on non-active proposal", async () => {
        await timeTravel(ONE_DAY+ONE_HOUR);
        expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_FAILED);

        const {v, r, s} = await signVote(member1, proposalId, 2);
        
        await expect(dao.connect(nonMember).castVoteBySig(member1.address, proposalId, 2, v, r, s))
          .to.be.revertedWith("VOTE_NOT_ACCEPTED");
      });

      it("Member cannot vote with an invalid support number", async () => {
        const {v, r, s} = await signVote(member1, proposalId, 3);
    
        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);

        // purposelly claim it's someone else's signature
        await expect(dao.connect(nonMember).castVoteBySig(member1.address, proposalId, 3, v, r, s))
          .to.be.revertedWith("VOTE_NOT_ACCEPTED");
      });

      it("Member cannot vote more than once", async () => {
        const {v, r, s} = await signVote(member1, proposalId, 0);

          await dao.connect(nonMember).castVoteBySig(member1.address, proposalId, 0, v, r, s);

          await expect(dao.connect(nonMember).castVoteBySig(member1.address, proposalId, 0, v, r, s))
            .to.be.revertedWith("VOTE_NOT_ACCEPTED");
      })
 
      it("Fails if signed data doesn't match claimed data", async () => {
          const {v, r, s} = await signVote(member1, proposalId, 2);
  
          expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);
  
          // purposelly try to change vote from abstinent to against
          await expect(dao.connect(nonMember).castVoteBySig(member1.address, proposalId, 0, v, r, s))
            .to.be.revertedWith("INVALID_SIGNATURE");
      });
    });

    describe("Vote by Signature - Bulk", () => {
      it("Successfully votes a proposal in batch", async () => {
        const {v: v1, r: r1, s: s1} = await signVote(member1, proposalId, 1);
        const {v: v2, r: r2, s: s2} = await signVote(member2, proposalId, 1);

        await dao.connect(nonMember).castVoteBySigBulk(
          [member1.address, member2.address],
          [proposalId, proposalId],
          [1, 1],
          [v1, v2],
          [r1, r2],
          [s1, s2]
        );

        let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);

        expect(forVotes).to.equal(2);
        expect(abstainVotes).to.equal(0);
        expect(againstVotes).to.equal(0);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);

      });
      it("Reverts entire bulk vote if one vote fails", async () => {
        const {v: v1, r: r1, s: s1} = await signVote(member1, proposalId, 1);
        const {v: v2, r: r2, s: s2} = await signVote(nonMember, proposalId, 1);

        expect(
          dao.connect(nonMember).castVoteBySigBulk(
            [member1.address, member2.address],
            [proposalId, proposalId],
            [1, 1],
            [v1, v2],
            [r1, r2],
            [s1, s2])
        ).to.be.revertedWith("VOTE_NOT_ACCEPTED");

        let [ , forVotes, abstainVotes, againstVotes, ..._] = await dao.proposals(proposalId);

        expect(forVotes).to.equal(0);
        expect(abstainVotes).to.equal(0);
        expect(againstVotes).to.equal(0);

        expect(await dao.status(proposalId)).to.equal(PROPOSAL.ACTIVE);
      });

      it("Fails if proposal arguments cannot be matched together", async () => {
        const {v: v1, r: r1, s: s1} = await signVote(member1, proposalId, 1);
        const {v: v2, r: r2, s: s2} = await signVote(nonMember, proposalId, 1);

        expect(
          dao.connect(nonMember).castVoteBySigBulk(
            [member1.address, member2.address],
            [proposalId, proposalId],
            [1, 1],
            [v1, v2],
            [r1, r2],
            [s1, s2, s2])
        ).to.be.revertedWith("INVALID_ARGUMENT");
      });

    });

  });

  describe("Proposal Execution", async () => {

    let proposalId: BigNumber;
    let callData: string;

    beforeEach(async () => {
      callData = greeterInterface.encodeFunctionData("setGreeting", ["Hello Macro"]);
      await dao.connect(member1).propose([greeter.address], [0], [callData], "Set greeting", ONE_DAY, ONE_DAY*2);
      
      const events = await dao.queryFilter(dao.filters.ProposalCreated());
      
      const [ , _proposalId, ..._] = events[0].args;

      proposalId = _proposalId;

      await dao.connect(member1).castVote(proposalId, 1);
      await dao.connect(member2).castVote(proposalId, 1);

      await timeTravel(ONE_DAY+ONE_HOUR);

      expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_PASSED);
    });

    it("Reverts when you try to execute proposal before minimum execution delay is passed", async () => {
      await timeTravel(ONE_DAY);

      await expect(dao.execute([greeter.address], [0], [callData], "Set greeting"))
        .to.be.revertedWith("EXECUTION_REFUSED");
    });

    it("Passed proposal can be executed", async () => {
      // go past minimum execution delay
      await timeTravel(ONE_DAY*2 + ONE_HOUR);

      await expect(dao.execute([greeter.address], [0], [callData], "Set greeting"))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(proposalId, true);

      expect(await dao.status(proposalId)).to.equal(PROPOSAL.EXECUTED);

      expect(await greeter.greet()).to.equal("Hello Macro");
    });

    it("Reverts when the proposal does not exist", async () => {
         // go past minimum execution delay
         await timeTravel(ONE_DAY*2 + ONE_HOUR);

         // intentionally set value to be 1 to make the hash incorrect
         await expect(dao.execute([greeter.address], [1], [callData], "Set greeting"))
          .to.be.revertedWith("PROPOSAL_NOT_FOUND");
    });

    it("Reverts when you try to execute failed proposal", async () => {
      const failedCallData = greeterInterface.encodeFunctionData("setGreeting", ["Hello Macro"]);
      await dao.connect(member1).propose([greeter.address], [0], [failedCallData], "Failed set greeting", ONE_DAY, ONE_DAY*2);
      const events = await dao.queryFilter(dao.filters.ProposalCreated());
      
      const [ , failedId, ..._] = events[1].args;

      await dao.connect(member1).castVote(failedId, 1);

      // vote ends
      await timeTravel(ONE_DAY+ONE_HOUR);
      expect(await dao.status(failedId)).to.equal(PROPOSAL.VOTE_FAILED);

      // check for failed status before min execution delay
      await expect(dao.execute([greeter.address], [0], [failedCallData], "Failed set greeting"))
        .to.be.revertedWith("EXECUTION_REFUSED");

    });

    it("Emits failed event when at least one of the executed steps fails", async () => {
      const failedCallData = greeterInterface.encodeFunctionData("fail");
      await dao.connect(member1).propose([greeter.address], [0], [failedCallData], "This will fail", ONE_DAY, ONE_DAY*2);
      const events = await dao.queryFilter(dao.filters.ProposalCreated());
      const [ , failedId, ..._] = events[1].args;

      await dao.connect(member1).castVote(failedId, 1);
      await dao.connect(member2).castVote(failedId, 1);

      await timeTravel(ONE_DAY*3 + ONE_HOUR);

      await expect(dao.execute([greeter.address], [0], [failedCallData], "This will fail"))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(failedId, false);
    });

    it("Reverts when you try to execute an active proposal", async () => {

    });


    it("Reverts when you try to execute a proposal twice", async () => {
       // go past minimum execution delay
       await timeTravel(ONE_DAY*2 + ONE_HOUR);

       await dao.execute([greeter.address], [0], [callData], "Set greeting");
 
       expect(await dao.status(proposalId)).to.equal(PROPOSAL.EXECUTED);
 
       expect(await greeter.greet()).to.equal("Hello Macro");

       await expect(dao.execute([greeter.address], [0], [callData], "Set greeting"))
        .to.be.revertedWith("EXECUTION_REFUSED");
    });

    it("Reverts when argument arrays do not match up", async () => {
      await expect(dao.execute([greeter.address], [0], [callData, callData], "Set greeting"))
        .to.be.revertedWith("INVALID_ARGUMENT");
    });

    it("Reverts when you try to execute a cancelled proposal", async () => {

    });

   


  });

  describe("Buy NFT!", async () => {

    it("Bid fails when there is not enough money in the dao", async () => {
       // propose 
       const callData = daoInterface.encodeFunctionData("buyNFT", [ONE_ETHER.mul(10), goodMarketAddress, 1]);
       await dao.connect(member1).propose([dao.address], [0], [callData], "Buy 1 NFT", ONE_HOUR, ONE_HOUR);
       
       const events = await dao.queryFilter(dao.filters.ProposalCreated());
       
       const [ , _proposalId, ..._] = events[0].args;
 
       const proposalId = _proposalId;
 
       await dao.connect(member1).castVote(proposalId, 1);
       await dao.connect(member2).castVote(proposalId, 1);
 
       await timeTravel(ONE_DAY);
 
       expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_PASSED);

        // execute 
      await expect(dao.connect(nonMember).execute([dao.address], [0], [callData], "Buy 1 NFT"))
      .to.emit(dao, "ProposalExecuted")
      .withArgs(proposalId, false);

      const bidEvents = await dao.queryFilter(dao.filters.NFTBid());
      expect(bidEvents.length).to.equal(0);

      // calling the buy function was still executed even though the buy failed
      expect(await dao.status(proposalId)).to.equal(PROPOSAL.EXECUTED);

    });

    it("When the market price of the nft has exceeded the max buy price, bid fails", async () => {
       // propose 
       const callData = daoInterface.encodeFunctionData("buyNFT", [ONE_ETHER, goodMarketAddress, ONE_ETHER.mul(2)]);
       await dao.connect(member1).propose([dao.address], [0], [callData], "Buy 1 NFT", ONE_HOUR, ONE_HOUR);
       
       const events = await dao.queryFilter(dao.filters.ProposalCreated());
       
       const [ , _proposalId, ..._] = events[0].args;
 
       const proposalId = _proposalId;
 
       await dao.connect(member1).castVote(proposalId, 1);
       await dao.connect(member2).castVote(proposalId, 1);
 
       await timeTravel(ONE_DAY);
 
       expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_PASSED);

        // execute 
      await expect(dao.connect(nonMember).execute([dao.address], [0], [callData], "Buy 1 NFT"))
      .to.emit(dao, "ProposalExecuted")
      .withArgs(proposalId, false);

      const bidEvents = await dao.queryFilter(dao.filters.NFTBid());
      expect(bidEvents.length).to.equal(0);

      // calling the buy function was still executed even though the buy failed
      expect(await dao.status(proposalId)).to.equal(PROPOSAL.EXECUTED);

    });

    it("Marketplace buy() revert triggers a failed bid and no 'NFTBid' event is emitted", async () => {
       // propose 
       const callData = daoInterface.encodeFunctionData("buyNFT", [ONE_ETHER, goodMarketAddress, 100]);
       await dao.connect(member1).propose([dao.address], [0], [callData], "Buy 1 NFT", ONE_HOUR, ONE_HOUR);
       
       const events = await dao.queryFilter(dao.filters.ProposalCreated());
       
       const [ , _proposalId, ..._] = events[0].args;
 
       const proposalId = _proposalId;
 
       await dao.connect(member1).castVote(proposalId, 1);
       await dao.connect(member2).castVote(proposalId, 1);
 
       await timeTravel(ONE_DAY);
 
       expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_PASSED);

       // execute 
      await expect(dao.connect(nonMember).execute([dao.address], [0], [callData], "Buy 1 NFT"))
      .to.emit(dao, "ProposalExecuted")
      .withArgs(proposalId, false);

      const bidEvents = await dao.queryFilter(dao.filters.NFTBid());
      expect(bidEvents.length).to.equal(0);

      // calling the buy function was still executed even though the buy failed
      expect(await dao.status(proposalId)).to.equal(PROPOSAL.EXECUTED);
    });

    it("Bid Fails if marketplace buy() returns failure", async () => {
        // propose 
        const callData = daoInterface.encodeFunctionData("buyNFT", [ONE_ETHER, goodMarketAddress, 10]);
        await dao.connect(member1).propose([dao.address], [0], [callData], "Buy 1 NFT", ONE_HOUR, ONE_HOUR);
        
        const events = await dao.queryFilter(dao.filters.ProposalCreated());
        
        const [ , _proposalId, ..._] = events[0].args;
  
        const proposalId = _proposalId;
  
        await dao.connect(member1).castVote(proposalId, 1);
        await dao.connect(member2).castVote(proposalId, 1);
  
        await timeTravel(ONE_DAY);
  
        expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_PASSED);

        // execute 
      await expect(dao.connect(nonMember).execute([dao.address], [0], [callData], "Buy 1 NFT"))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(proposalId, true);

      // calling the buy function was still executed even though the buy failed
      expect(await dao.status(proposalId)).to.equal(PROPOSAL.EXECUTED);


      const bidEvents = await dao.queryFilter(dao.filters.NFTBid());
      const [nftId, price, success] = bidEvents[0].args;

      expect(nftId).to.equal(10);
      expect(price).to.equal(ONE_ETHER);
      expect(success).to.equal(false);
    });

    it("Buys NFT", async () => {
      // propose 
      const callData = daoInterface.encodeFunctionData("buyNFT", [ONE_ETHER, goodMarketAddress, 1]);
      await dao.connect(member1).propose([dao.address], [0], [callData], "Buy 1 NFT", ONE_HOUR, ONE_HOUR);
      
      const events = await dao.queryFilter(dao.filters.ProposalCreated());
      
      const [ , _proposalId, ..._] = events[0].args;

      const proposalId = _proposalId;

      await dao.connect(member1).castVote(proposalId, 1);
      await dao.connect(member2).castVote(proposalId, 1);

      await timeTravel(ONE_DAY);

      expect(await dao.status(proposalId)).to.equal(PROPOSAL.VOTE_PASSED);

      // execute
      await expect(dao.connect(nonMember).execute([dao.address], [0], [callData], "Buy 1 NFT"))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(proposalId, true);

      const bidEvents = await dao.queryFilter(dao.filters.NFTBid());
      const [nftId, price, success] = bidEvents[0].args;

      expect(nftId).to.equal(1);
      expect(price).to.equal(ONE_ETHER);
      expect(success).to.equal(true);
    });
  });



});
