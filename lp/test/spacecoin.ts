import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";

import { SpaceCoin, SpaceCoin__factory, SpaceCoinICO__factory, SpaceCoinICO } from "../typechain";

const ONE_TOKEN = BigNumber.from("1000000000000000000"); // 10^18
const ONE_ETHER = ethers.utils.parseEther("1");

describe("SpaceCoin", () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let treasury: SignerWithAddress;

  let spaceCoinFactory: SpaceCoin__factory;
  let spaceCoin: SpaceCoin;

  // deploy space coin contract
  beforeEach(async () => {
    [deployer, alice, bob, treasury] = await ethers.getSigners();
    spaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
    spaceCoin = await spaceCoinFactory.deploy(treasury.address);
    await spaceCoin.deployed()
  })

  describe("Token Contract", () => {

    it("Is named 'SpaceCoin'", async () => {
      expect(await spaceCoin.name()).to.equal("SpaceCoin");
    });

    it("Is represented by the symbol 'SPC'", async () => {
      expect(await spaceCoin.symbol()).to.equal("SPC");
    });

    it("Has a total supply of 500,000 SPC", async () => {
      expect(await spaceCoin.totalSupply()).to.equal(ONE_TOKEN.mul(500_000));
    });

    it("Allocates 150,000 SPC of supply to ICO investors (30,000 ETH worth)", async () => {
      // transfers 150,000 SPC to the deployer, who is the ICO contract in the final implementation
      expect(await spaceCoin.balanceOf(deployer.address)).to.equal(ONE_TOKEN.mul(150_000));
    });

    it("Stores the remaining 350,000 SPC of supply in the treasury", async () => {
      expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ONE_TOKEN.mul(350_000));
    });

    it("Allows owner to toggle on/off a 2% tax for transfers into the treasury account", async () => {
      expect(await spaceCoin.taxEffective()).to.equal(false);
      // toggle on
      await spaceCoin.connect(deployer).setTax(true);
      expect(await spaceCoin.taxEffective()).to.equal(true);
      // toggle off
      await spaceCoin.connect(deployer).setTax(false);
      expect(await spaceCoin.taxEffective()).to.equal(false);
    });

    it("Prevents non-owners from toggling on/off the 2% tax", async () => {
      await expect(spaceCoin.connect(alice).setTax(true))
        .to.be.revertedWith("ONLY_OWNER");
    });

    it("Defaults to no tax charged for SPC transfers", async () => {
      // transfer from deployer to alice
      await spaceCoin.connect(deployer).transfer(alice.address, ONE_TOKEN);

      expect(await spaceCoin.balanceOf(alice.address)).to.equal(ONE_TOKEN);
      expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ONE_TOKEN.mul(350_000));
      expect(await spaceCoin.balanceOf(deployer.address)).to.equal(ONE_TOKEN.mul(149_999));

      // transfer from alice to bob
      await spaceCoin.connect(alice).transfer(bob.address, ONE_TOKEN);
      expect(await spaceCoin.balanceOf(alice.address)).to.equal(0);
      expect(await spaceCoin.balanceOf(bob.address)).to.equal(ONE_TOKEN);
      expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ONE_TOKEN.mul(350_000));

    });

    it("Transfers correctly when tax is on and treasury is receipient and sender", async () => {
       // transfer from treasury to alice without tax
       await spaceCoin.connect(treasury).transfer(alice.address, ONE_TOKEN);
       expect(await spaceCoin.balanceOf(alice.address)).to.equal(ONE_TOKEN);
       expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ONE_TOKEN.mul(349_999));

      // transfer from alice to treasury without tax
      await spaceCoin.connect(alice).transfer(treasury.address, ONE_TOKEN);
      expect(await spaceCoin.balanceOf(alice.address)).to.equal(0);
      expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ONE_TOKEN.mul(350_000));

      await spaceCoin.connect(deployer).setTax(true);

      // transfer from treasury to alice with tax
      await spaceCoin.connect(treasury).transfer(alice.address, ONE_TOKEN);
      expect(await spaceCoin.balanceOf(alice.address)).to.equal(ethers.utils.parseEther("0.98"));
      expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ethers.utils.parseEther("349999.02"));

      // transfer from alice to treasury with tax
      await spaceCoin.connect(alice).transfer(treasury.address, ethers.utils.parseEther("0.98"));
      expect(await spaceCoin.balanceOf(alice.address)).to.equal(0);
      expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ONE_TOKEN.mul(350_000));
    })

    it("Charges 2% for SPC transfers (deposited into the treasury) when tax is toggled on", async () => {
       // transfer from deployer to alice
       await spaceCoin.connect(deployer).transfer(alice.address, ONE_TOKEN);

       expect(await spaceCoin.balanceOf(alice.address)).to.equal(ONE_TOKEN);
       expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ONE_TOKEN.mul(350_000));
       expect(await spaceCoin.balanceOf(deployer.address)).to.equal(ONE_TOKEN.mul(149_999));
 
       // toggle on
       await spaceCoin.connect(deployer).setTax(true);
 
       // transfer from alice to bob with tax
       await spaceCoin.connect(alice).transfer(bob.address, ONE_TOKEN);
 
       expect(await spaceCoin.balanceOf(alice.address)).to.equal(0);
       expect(await spaceCoin.balanceOf(bob.address)).to.equal(ethers.utils.parseEther("0.98"));
       expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ethers.utils.parseEther("350000.02"));
 
       // toggle off
       await spaceCoin.connect(deployer).setTax(false);
 
       // transfer from bob to alice without tax
       await spaceCoin.connect(bob).transfer(alice.address, ethers.utils.parseEther("0.98"));
       
       expect(await spaceCoin.balanceOf(bob.address)).to.equal(0);
       expect(await spaceCoin.balanceOf(alice.address)).to.equal(ethers.utils.parseEther("0.98"));
       expect(await spaceCoin.balanceOf(treasury.address)).to.equal(ethers.utils.parseEther("350000.02"));    
    });
  });
});

describe("SpaceCoin", () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charles: SignerWithAddress;
  let david: SignerWithAddress;
  let edward: SignerWithAddress;
  let frank: SignerWithAddress;
  let treasury: SignerWithAddress;

  let spaceCoin: SpaceCoin;
  let spaceCoinAddress: string;

  let spaceCoinICOFactory: SpaceCoinICO__factory;
  let spaceCoinICO: SpaceCoinICO;

  let investors: SignerWithAddress[];
  let moreInvestors: Wallet[];
  
  let investorToDrain = 190;


  const checkFunds = async (amount: BigNumber) => {
    expect(await spaceCoinICO.fundMax()).to.equal(amount);
    expect(await spaceCoinICO.currentFund()).to.equal(amount);
  }

  describe("ICO Contract", () => {


    beforeEach(async () => {

      [deployer, alice, bob, charles, david, edward, frank, treasury, ...investors] = await ethers.getSigners();

      const refillAccounts = [alice, bob, charles, david, edward];

      for (let i = 0; i < refillAccounts.length; i++) {
        const balance = await waffle.provider.getBalance(refillAccounts[i].address);
        if(balance.lt(ONE_ETHER.mul(2000))) {
          console.log(`${i} ran out of funds, refilling...`);
          await investors[investorToDrain].sendTransaction({to: refillAccounts[i].address, value: ONE_ETHER.mul(9_999)});
          investorToDrain--;
        }
      }

      spaceCoinICOFactory = await ethers.getContractFactory("SpaceCoinICO");

      spaceCoinICO = await spaceCoinICOFactory.deploy(treasury.address);
      await spaceCoinICO.deployed();

      const event = (await spaceCoinICO.queryFilter(spaceCoinICO.filters.SpaceCoinDeployed()));
      
      spaceCoinAddress = event[0].args[0];
      spaceCoin = await ethers.getContractAt("SpaceCoin", spaceCoinAddress);
    });


    describe("Deployment", () => {
      it("Deploys contract", async () => {
        expect(spaceCoinICO.address).to.be.ok;
      });

      it("Sets owner and treasury address", async () => {
        expect(await spaceCoinICO.treasury()).to.equal(treasury.address);
        expect(await spaceCoinICO.owner()).to.equal(deployer.address);
      });

      it("Deploys SpaceCoin contract as well", async () => {
        expect(await spaceCoinICO.spaceCoin()).to.equal(spaceCoin.address);
        expect(await spaceCoin.name()).to.equal("SpaceCoin");
      });

      it("SpaceCoin deployment emits 'SpaceCoinDeployed' event", async () => {
        const event = (await spaceCoinICO.queryFilter(spaceCoinICO.filters.SpaceCoinDeployed()));
        
        expect(event[0].event!).to.equal("SpaceCoinDeployed");
        expect(event[0].args[0]).to.equal(spaceCoinAddress);
      });

    });

    describe("Management", () => {
      it("Allows owner to set tax on", async () => {

        expect(await spaceCoin.taxEffective()).to.equal(false);

        await spaceCoinICO.connect(deployer).setTax(true);

        expect(await spaceCoin.taxEffective()).to.equal(true);
      });

      it("Prevents non-owners from setting tax", async () => {
        expect(await spaceCoin.taxEffective()).to.equal(false);

        await expect(spaceCoinICO.connect(alice).setTax(true))
          .to.be.revertedWith("SpaceCoinICO.sol: MUST_BE_OWNER");

      });

      it("Allows owner to advance phase forward", async () => {
        // seed phase
        expect(await spaceCoinICO.phase()).to.equal(0);

        // general phase
        expect(await spaceCoinICO.advance(0));
        expect(await spaceCoinICO.phase()).to.equal(1);

        // open phase
        expect(await spaceCoinICO.advance(1));
        expect(await spaceCoinICO.phase()).to.equal(2);

        // no more phases to advance to
        await expect(spaceCoinICO.advance(2))
          .to.be.reverted;
      });

      it("Prevents owner from skipping a phase", async () => {
        // seed phase
        expect(await spaceCoinICO.phase()).to.equal(0);

         // we are in phase 0 but we pretend we're in phase 1
        await expect(spaceCoinICO.advance(1))
          .to.be.revertedWith("INVALID_PHASE");
      })

      it("Prevents non-owners from advancing phase forward", async () => {
        expect(await spaceCoinICO.connect(alice).phase()).to.equal(0);
        await expect(spaceCoinICO.connect(alice).advance(0))
          .to.be.revertedWith("SpaceCoinICO.sol: MUST_BE_OWNER");
      });

      it("Emits a 'PhaseAdvance' event after phase is advanced forward", async () => {
        expect(await spaceCoinICO.connect(alice).phase()).to.equal(0);
        await expect(spaceCoinICO.connect(deployer).advance(0))
          .to.emit(spaceCoinICO, "PhaseAdvance")
          .withArgs(1)
      });

      it("Allows owner to pause or resume funding at any time", async () => {
        expect(await spaceCoinICO.isPaused()).to.equal(false);
        
        await spaceCoinICO.setPausedState(true);

        expect(await spaceCoinICO.isPaused()).to.equal(true);

        await spaceCoinICO.setPausedState(true);

        expect(await spaceCoinICO.isPaused()).to.equal(true);

        await spaceCoinICO.setPausedState(false);

        expect(await spaceCoinICO.isPaused()).to.equal(false);

        await spaceCoinICO.setPausedState(false);

        expect(await spaceCoinICO.isPaused()).to.equal(false);
      });

      it("Prevents non-owner from pause or resume funding at any time", async () => {
        await expect(spaceCoinICO.connect(alice).setPausedState(true))
          .to.be.revertedWith("SpaceCoinICO.sol: MUST_BE_OWNER");
      });

      it("Allows owner to add seed investors to the allowlist", async () => {
        await spaceCoinICO.addSeedInvestors([alice.address]);

        expect(await spaceCoinICO.isSeedInvestor(alice.address)).to.equal(true);
        expect(await spaceCoinICO.isSeedInvestor(bob.address)).to.equal(false);

        await spaceCoinICO.addSeedInvestors([bob.address, investors[0].address]);

        expect(await spaceCoinICO.isSeedInvestor(alice.address)).to.equal(true);
        expect(await spaceCoinICO.isSeedInvestor(bob.address)).to.equal(true);
        expect(await spaceCoinICO.isSeedInvestor(investors[0].address)).to.equal(true);
        expect(await spaceCoinICO.isSeedInvestor(investors[1].address)).to.equal(false);
      });

      it("Allows owner to remove seed investors from the allowlist", async () => {
        await spaceCoinICO.addSeedInvestors([alice.address, bob.address, investors[0].address]);

        expect(await spaceCoinICO.isSeedInvestor(alice.address)).to.equal(true);
        expect(await spaceCoinICO.isSeedInvestor(bob.address)).to.equal(true);
        expect(await spaceCoinICO.isSeedInvestor(investors[0].address)).to.equal(true);

        await spaceCoinICO.removeSeedInvestors([alice.address]);

        expect(await spaceCoinICO.isSeedInvestor(alice.address)).to.equal(false);
        expect(await spaceCoinICO.isSeedInvestor(bob.address)).to.equal(true);
        expect(await spaceCoinICO.isSeedInvestor(investors[0].address)).to.equal(true);

        await spaceCoinICO.removeSeedInvestors([bob.address, investors[0].address]);
      });


      it("Prevents owner from adding seed investor twice", async () => {
        await spaceCoinICO.addSeedInvestors([alice.address]);

        // waffle matchers do not allow for asserting on custom error
        await expect(spaceCoinICO.addSeedInvestors([alice.address]))
          .to.be.revertedWith(`reverted with custom error 'SeedInvestorAddedAlready("${alice.address}")'`);
      });

      it("Prevents owner from removing seed investor that is not allow-listed", async () => {
        await expect(spaceCoinICO.removeSeedInvestors([alice.address]))
          .to.be.revertedWith(`reverted with custom error 'NoInvestorExists("${alice.address}")'`);
      });


      it("Prevents non-owners from adding seed investors to the allowlist", async () => {
        await expect(spaceCoinICO.connect(alice).addSeedInvestors([alice.address]))
          .to.be.revertedWith("SpaceCoinICO.sol: MUST_BE_OWNER")
      });

      it("Prevents non-owners from removing seed investors from the allowlist", async () => {
        await expect(spaceCoinICO.connect(alice).removeSeedInvestors([alice.address]))
          .to.be.revertedWith("SpaceCoinICO.sol: MUST_BE_OWNER")
      });
    });


    describe("Contributions & Redemptions", () => {

      describe("Seed Phase", () => {
        beforeEach(async () => {
          // confirm we are in the seed phase
          expect(await spaceCoinICO.phase()).to.equal(0);
          spaceCoinICO.addSeedInvestors([alice.address, bob.address]);
        });
  
        // it("Does not alloy contributions of 0 ETH from allowlisted investors");
  
        it("Allows contribution from allowlisted investors", async () => {
          await spaceCoinICO.connect(alice).contribute({value: ONE_ETHER });
          await checkFunds(ONE_ETHER);
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER);
        });
  
        it("Allows contributions up to individual limit from allowlisted investors with no excess amount", async () => {
          // console.log("doing something here...");
          // alice contributes 1500 ETH
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1500) }))
             .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(alice.address, ONE_ETHER.mul(1500), ONE_ETHER.mul(1500), true, false);
  
          console.log('hardhatyo');
          
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER.mul(1500));
          await checkFunds(ONE_ETHER.mul(1500));
  
          // bob contributes 1499 ETH, then 1 ETH
          await spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(1499) });
  
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(1499));
          await checkFunds(ONE_ETHER.mul(2999));
  
          await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER }))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(bob.address, ONE_ETHER.mul(1500), ONE_ETHER, true, false);
  
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(1500));
          await checkFunds(ONE_ETHER.mul(3000));
        });
  
        // todo check for refund on sender
        it("Allows contributions up to individual limit from allowlisted investors and refunds excess amount", async () => {
          // alice contributes 1500 ETH
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1501) }))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(alice.address, ONE_ETHER.mul(1500), ONE_ETHER.mul(1500), true, false);
          
          // ensure that 1500 ETH, not 1501 ETH, was kept by the ICO
          expect(await waffle.provider.getBalance(spaceCoinICO.address)).to.equal(ONE_ETHER.mul(1500));
          checkFunds(ONE_ETHER.mul(1500));
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER.mul(1500));
  
          // bob contributes 1499 ETH, then 1 ETH
          await spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(1499) });
  
          // ensure that 1500 ETH, not 1502 ETH, was kept by the ICO
          expect(await waffle.provider.getBalance(spaceCoinICO.address)).to.equal(ONE_ETHER.mul(2999));
          checkFunds(ONE_ETHER.mul(2999));
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(1499));
  
          await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(3) }))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(bob.address, ONE_ETHER.mul(1500), ONE_ETHER, true, false);
          
          // ensure that another 1500 ETH, not 1502 ETH, was kept by the ICO (on top of existing 1500 ETH)
          expect(await waffle.provider.getBalance(spaceCoinICO.address)).to.equal(ONE_ETHER.mul(3000));
          checkFunds(ONE_ETHER.mul(3000));
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(1500));
        });
  
        it("Blocks contributions above individual limit from allowlisted investors", async () => {
          await spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1500) });
  
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER}))
            .to.be.revertedWith(`reverted with custom error 'MaxIndividualContributionFilled("${alice.address}")'`);
        });
  
        it("Allows contributions up to funding round limit from allowlisted investors and refunds excess amount", async () => {
          // add investors to the allowlist
          await spaceCoinICO.addSeedInvestors(investors.slice(0, 10).map((s) => s.address));
          for (let i = 0; i < 10 ; i++) {
            await spaceCoinICO.connect(investors[i]).contribute({value: ONE_ETHER.mul(1490) });
          }

          // console.log("we out here");
  
          // reaches funding limit for seed phase and refunds
          await expect(spaceCoinICO.connect(alice).contribute({value : ONE_ETHER.mul(101)}))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(alice.address, ONE_ETHER.mul(100), ONE_ETHER.mul(100), false, true);

          checkFunds(ONE_ETHER.mul(15_000));
          expect(await waffle.provider.getBalance(spaceCoinICO.address)).to.equal(ONE_ETHER.mul(15_000));

        });
  
        it("Blocks contributions above funding round limit from allowlisted investors", async () => {
          // add investors to the allowlist
          await spaceCoinICO.addSeedInvestors(investors.slice(0, 10).map((s) => s.address));
          for (let i = 0; i < 10 ; i++) {
            await spaceCoinICO.connect(investors[i]).contribute({value: ONE_ETHER.mul(1500) });
          }
  
          // exceeds funding limit for seed phase
          await expect(spaceCoinICO.connect(alice).contribute({value : ONE_ETHER}))
            .to.be.revertedWith(`reverted with custom error 'FundingRoundFilled("${alice.address}", 0)'`);
        });
  
        it("Blocks contributions from non-allowlisted investors", async () => {
          await expect(spaceCoinICO.connect(investors[0]).contribute({value: ONE_ETHER}))
            .to.revertedWith("SpaceCoinICO.sol: SEED_PHASE_INVESTORS_ONLY");
        });
  
        it("Emits a Contribute event after a contribution is made from an allowlisted investor", async () => {
          expect(await spaceCoinICO.connect(alice).contribute({value: ONE_ETHER}))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(alice.address, ONE_ETHER, ONE_ETHER, false, false);
        });
  
        it("Blocks contributions when fundraising is paused", async () => {
          await spaceCoinICO.setPausedState(true);
          
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER}))
            .to.be.revertedWith("SpaceCoinICO.sol: FUNDING_MUST_BE_UNPAUSED");
        });
  
        it("Prevents token redemption", async () => {
          await spaceCoinICO.connect(alice).contribute({value: ONE_ETHER});
          
          await expect(spaceCoinICO.connect(alice).redeem())
            .to.be.revertedWith("MUST_BE_PHASE_OPEN");
        });

        // copy these 3 to next phase
  
        it("Successfully takes contribution when both funding limit and individual contribution are met simultaneously with no refund", async () => {
             // add investors to the allowlist
             await spaceCoinICO.addSeedInvestors(investors.slice(0, 10).map((s) => s.address));
             for (let i = 0; i < 10 ; i++) {
               await spaceCoinICO.connect(investors[i]).contribute({value: ONE_ETHER.mul(1350) });
             }
     
             // reaches funding limit for seed phase and individual limit at the same time
             await expect(spaceCoinICO.connect(alice).contribute({value : ONE_ETHER.mul(1500)}))
               .to.emit(spaceCoinICO, "Contribute")
               // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
               .withArgs(alice.address, ONE_ETHER.mul(1500), ONE_ETHER.mul(1500), true, true);
             
             expect(await waffle.provider.getBalance(spaceCoinICO.address)).to.equal(ONE_ETHER.mul(15_000));
        });

        it("Successfully takes contribution when both funding limit and individual contribution are met simultaneously with fund limit refund greather than individual limit refund", async () => {
          // reach 14,000 ETH
          await spaceCoinICO.addSeedInvestors(investors.slice(0, 10).map((s) => s.address));
          for (let i = 0; i < 10 ; i++) {
            await spaceCoinICO.connect(investors[i]).contribute({value: ONE_ETHER.mul(1400) });
          }

          // Fund at 14,000: fund refund would be 501
          // Alice contribution at 0: Individual refund would be 1
          // We take fund refund over individual refund since it's greater.

          await expect(spaceCoinICO.connect(alice).contribute({value : ONE_ETHER.mul(1501)}))
          .to.emit(spaceCoinICO, "Contribute")
          // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
          .withArgs(alice.address, ONE_ETHER.mul(1000), ONE_ETHER.mul(1000), false, true);

          await checkFunds(ONE_ETHER.mul(15_000));
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER.mul(1000));
        });

        it("Accepts non-integer contribution", async () => {
          await spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.div(2) });
          await checkFunds(ONE_ETHER.div(2));
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER.div(2));
        });


        it("Successfully takes contribution when both funding limit and individual contribution are met simultaneously with individual limit refund greater than fund limit refund", async () => {
          // reach 14,990 ETH
          await spaceCoinICO.addSeedInvestors(investors.slice(0, 10).map((s) => s.address));
          for (let i = 0; i < 10 ; i++) {
            await spaceCoinICO.connect(investors[i]).contribute({value: ONE_ETHER.mul(1499) });
          }

          // Fund at 14,990: fund refund would be 10
          // Alice contribution at 1499: Individual refund would be 19 eth
          // We take fund refund over individual refund since it's greater.

          // can individual refund be greater than fund refund?
          // ex: Fund limit is 20, individual limit is 10
          // contributions total is 19. individual contributions is 9.5
          // contribute 2
          // refunded 1 fund. refunded 1.5 by individual

          await expect(spaceCoinICO.connect(investors[0]).contribute({value : ONE_ETHER.mul(20) }))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(investors[0].address, ONE_ETHER.mul(1500), ONE_ETHER, true, false);
          await checkFunds(ONE_ETHER.mul(14_991));
          expect(await spaceCoinICO.currentContributions(investors[0].address)).to.equal(ONE_ETHER.mul(1500));
        });
      });
  
      describe("General Phase", () => {

        const bulkContributeEthInThousands = async (amount: number) => {
          // start from sufficiently high account # that hasn't been used yet so we don't run out of test ether
          const startIndex = 100;
          // up to 29,000 ETH
          for (let i = 0; i < amount; i++) {
            await expect(spaceCoinICO.connect(investors[i + startIndex]).contribute({value: ONE_ETHER.mul(1000)}))
              .to.emit(spaceCoinICO, "Contribute")
              .withArgs(investors[i + startIndex].address, ONE_ETHER.mul(1000), ONE_ETHER.mul(1000), true, false);
            await checkFunds(ethers.utils.parseEther("1000").mul(i + 2));
          }
        }
        
        beforeEach(async () => {
          
          await spaceCoinICO.addSeedInvestors([charles.address, david.address]);
          await spaceCoinICO.connect(charles).contribute({value : ONE_ETHER.mul(1000)});
          await checkFunds(ONE_ETHER.mul(1000));

          // confirm we are in the general phase
          await spaceCoinICO.advance(0);

          expect(await spaceCoinICO.phase()).to.equal(1);

        });

        it("Allows contributions from allowlisted investors", async () => {
          await expect(spaceCoinICO.connect(david).contribute({value: ONE_ETHER }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(david.address, ONE_ETHER, ONE_ETHER, false, false);
          await checkFunds(ONE_ETHER.mul(1_001));
          expect(await spaceCoinICO.currentContributions(david.address)).to.equal(ONE_ETHER);
        });
  
        it("Allows contributions from non-whitelisted investors", async () => {
          await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(bob.address, ONE_ETHER, ONE_ETHER, false, false);
          await checkFunds(ONE_ETHER.mul(1_001));
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER);
        });
  
        it("Blocks contributions from seed investors who are already above general individual limit", async () => {
          await expect(spaceCoinICO.connect(charles).contribute({value: ONE_ETHER }))
            .to.be.revertedWith(`reverted with custom error 'MaxIndividualContributionFilled("${charles.address}")'`);
        });

        it("Allows contributions from general investors up to general individual limit", async () => {
          // alice gets to limit in one transaction
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1000) }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(alice.address,  ONE_ETHER.mul(1000),  ONE_ETHER.mul(1000), true, false);
          await checkFunds( ONE_ETHER.mul(2000));
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER.mul(1000));

          // bob gets to limit in two transactions
          await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(500) }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(bob.address,  ONE_ETHER.mul(500),  ONE_ETHER.mul(500), false, false);
          await checkFunds( ONE_ETHER.mul(2500));
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(500));

          await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(500) }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(bob.address,  ONE_ETHER.mul(1000),  ONE_ETHER.mul(500), true, false);
          await checkFunds( ONE_ETHER.mul(3000));
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(1000));
        });

        it("Allows contributions from general investors up to general individual limit with excess refunded", async () => {
          // alice gets to limit in one transaction
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1001) }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(alice.address,  ONE_ETHER.mul(1000),  ONE_ETHER.mul(1000), true, false);
          await checkFunds( ONE_ETHER.mul(2000));
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER.mul(1000));

          // bob gets to limit in two transactions
          await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(500) }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(bob.address,  ONE_ETHER.mul(500),  ONE_ETHER.mul(500), false, false);
          await checkFunds( ONE_ETHER.mul(2500));
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(500));

          await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(501) }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(bob.address,  ONE_ETHER.mul(1000),  ONE_ETHER.mul(500), true, false);
          await checkFunds( ONE_ETHER.mul(3000));
          expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(1000));
        });
  
        it("Blocks contributions from general investors above general individual limit", async () => {
          await spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1000)});
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER }))
            .to.be.revertedWith(`reverted with custom error 'MaxIndividualContributionFilled("${alice.address}")'`);
        });


        it("Allow contributions up to funding round limit", async () => {
          // get to 29,000 ETH
          await bulkContributeEthInThousands(28);

          // get to 30,000 ETH
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1000)}))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(alice.address, ONE_ETHER.mul(1_000), ONE_ETHER.mul(1_000), true, true);
          await checkFunds(ONE_ETHER.mul(30_000));
        });

        it("Allow contributions up to funding round limit and refunds excess amount", async () => {
          // get to 29,000 ETH
          await bulkContributeEthInThousands(28);
      
              // get to 30,000 ETH
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1100)}))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(alice.address, ONE_ETHER.mul(1_000), ONE_ETHER.mul(1_000), true, true);
          await checkFunds(ONE_ETHER.mul(30_000));
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER.mul(1_000));
          
        });
  
        it("Blocks contributions above funding round limit", async () => {
           // get to 29,000 ETH
           await bulkContributeEthInThousands(28);

            // up to 30,000 ETH
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(1000)}))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(alice.address, ONE_ETHER.mul(1_000), ONE_ETHER.mul(1_000), true, true);
            
          await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER }))
            .to.be.revertedWith(`reverted with custom error 'FundingRoundFilled("${bob.address}", 1)'`);
        });

        it("Blocks contributions when fundraising is paused", async () => {
          await spaceCoinICO.setPausedState(true);
          
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER}))
            .to.be.revertedWith("SpaceCoinICO.sol: FUNDING_MUST_BE_UNPAUSED");
        });
  
        it("Allows contributions after fundraising is paused and resumed", async () => {
          await spaceCoinICO.setPausedState(true);

          await spaceCoinICO.setPausedState(false);

          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER }))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(alice.address, ONE_ETHER, ONE_ETHER, false, false);
        });
  
        it("Prevents token redemptions", async () => {
          await spaceCoinICO.connect(alice).contribute({value: ONE_ETHER});
          
          await expect(spaceCoinICO.connect(alice).redeem())
            .to.be.revertedWith("MUST_BE_PHASE_OPEN");
        });

        // begin


        it("Successfully takes contribution when both funding limit and individual contribution are met simultaneously with no refund", async () => {
            // get to 29,000 ETH
            await bulkContributeEthInThousands(28);
  
            // reaches funding limit for seed phase and individual limit at the same time
            await expect(spaceCoinICO.connect(alice).contribute({value : ONE_ETHER.mul(1000)}))
              .to.emit(spaceCoinICO, "Contribute")
              // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
              .withArgs(alice.address, ONE_ETHER.mul(1000), ONE_ETHER.mul(1000), true, true);

            await checkFunds(ONE_ETHER.mul(30_000));
            expect(await waffle.provider.getBalance(spaceCoinICO.address)).to.equal(ONE_ETHER.mul(30_000));
        });

     it("Successfully takes contribution when both funding limit and individual contribution are met simultaneously with fund refund greather than individual limit refund", async () => {
        // get to 29,000 ETH
        await bulkContributeEthInThousands(28);
        // get to 29,500 ETH
        await spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(500)});

       // Fund at 29,500: fund refund would be 501
       // Alice contribution at 0: Individual refund would be 1
       // We take individual refund over fund refund since it's greater.

       await expect(spaceCoinICO.connect(alice).contribute({value : ONE_ETHER.mul(1001)}))
       .to.emit(spaceCoinICO, "Contribute")
       // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
       .withArgs(alice.address, ONE_ETHER.mul(500), ONE_ETHER.mul(500), false, true);

       await checkFunds(ONE_ETHER.mul(30_000));
       expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(ONE_ETHER.mul(500));
     });

     it("b Successfully takes contribution when both funding limit and individual contribution are met simultaneously with individual refund greater than fund refund", async () => {
        // get to 29,499 ETH
        await bulkContributeEthInThousands(27);
        await spaceCoinICO.connect(david).contribute({value: ONE_ETHER.mul(500)})
        await spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(999)});

       // Fund at 29,499: fund refund would be 499.
       // Bob contribution at 1499: Individual refund would be 999 eth
       // We take individual refund over fund limit refund since it's greater.

       await expect(spaceCoinICO.connect(bob).contribute({value : ONE_ETHER.mul(1000) }))
         .to.emit(spaceCoinICO, "Contribute")
         // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
         .withArgs(bob.address, ONE_ETHER.mul(1000), ONE_ETHER, true, false);
       await checkFunds(ONE_ETHER.mul(29_500));
       expect(await spaceCoinICO.currentContributions(bob.address)).to.equal(ONE_ETHER.mul(1000));
     });
        //end
      });
  
      describe("Open Phase", () => {

        const bulkContributeEthInThousands = async (amount: number) => {
          // start from sufficiently high account # that hasn't been used yet so we don't run out of test ether
          const startIndex = 100;
          for (let i = 0; i < amount; i++) {
            await expect(spaceCoinICO.connect(investors[i + startIndex]).contribute({value: ONE_ETHER.mul(1000)}))
              .to.emit(spaceCoinICO, "Contribute")
              .withArgs(investors[i + startIndex].address, ONE_ETHER.mul(1000), ONE_ETHER.mul(1000), false, false);
          }
        }

        beforeEach(async() => {
          await spaceCoinICO.addSeedInvestors([charles.address, david.address]);
          await spaceCoinICO.connect(charles).contribute({value : ONE_ETHER.mul(1500)});

          // console.log('after charlie contributes');

          // confirm we are in the general phase
          await spaceCoinICO.advance(0);
          expect(await spaceCoinICO.phase()).to.equal(1);

          await spaceCoinICO.connect(david).contribute({value: ONE_ETHER.mul(1000)});

          // console.log('after david contributes');

          await spaceCoinICO.advance(1);
          expect(await spaceCoinICO.phase()).to.equal(2);

          // console.log('finished beforeach')
        });

        it("Blocks redeeming if you have no contributions", async () => {
          await expect(spaceCoinICO.connect(alice).redeem())
            .to.be.revertedWith("SpaceCoinICO.sol: MUST_HAVE_CONTRIBUTIONS");
        })

        it("Automatically redeems new contributions for tokens", async () => {
          console.log('begin test in question');

          expect(await spaceCoin.balanceOf(alice.address)).to.equal(0);

          await spaceCoinICO.connect(alice).contribute({value:ONE_ETHER.div(2)});

          // current contributions are immediately cashed out so it's 0!
          expect(await spaceCoinICO.currentContributions(alice.address)).to.equal(0);
          expect(await spaceCoinICO.purchased(alice.address)).to.equal(ONE_ETHER.div(2));

          // 2.5 SPC rewarded
          expect(await spaceCoin.balanceOf(alice.address)).to.equal(
            (ONE_TOKEN.mul(2)).add(ONE_TOKEN.div(2))
          );          
        });
  
        it("Does not limit contribution amount", async () => {
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(2000)}))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(alice.address, ONE_ETHER.mul(2000), ONE_ETHER.mul(2000), false, false);
        });
  
        it("Allows seed investor to exceed past contribution limits", async () => {
          await expect(spaceCoinICO.connect(charles).contribute({value: ONE_ETHER.mul(2000)}))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(charles.address, ONE_ETHER.mul(3500), ONE_ETHER.mul(2000), false, false);
        });
  
        it("Allows general phase contributor to exceed past contribution limits", async () => {
          await expect(spaceCoinICO.connect(david).contribute({value: ONE_ETHER.mul(2000)}))
            .to.emit(spaceCoinICO, "Contribute")
            // address, total contribution, last contribution, individualLimit reached, phaseLimit reached
            .withArgs(david.address, ONE_ETHER.mul(3000), ONE_ETHER.mul(2000), false, false);
        });
  
        it("Blocks contributions when fundraising is paused", async () => {
          await spaceCoinICO.setPausedState(true);
          
          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER}))
            .to.be.revertedWith("SpaceCoinICO.sol: FUNDING_MUST_BE_UNPAUSED");
        });
  
        it("Allows a pre-open phase contributions to be redeemed for tokens", async () => {
          // charles is pre-seed investor redeeming his tokens

          expect(await spaceCoinICO.connect(charles).currentContributions(charles.address)).to.eq(ONE_ETHER.mul(1500));

          await spaceCoinICO.connect(charles).redeem();

          expect(await spaceCoinICO.currentContributions(charles.address)).to.eq(ONE_ETHER.mul(0));
          expect(await spaceCoin.balanceOf(charles.address)).to.equal((ONE_TOKEN.mul(7500)));          

          // david is general investor redeeming his tokens
         
          expect(await spaceCoinICO.connect(david).currentContributions(david.address)).to.eq(ONE_ETHER.mul(1000));

          await spaceCoinICO.connect(david).redeem();

          expect(await spaceCoinICO.currentContributions(david.address)).to.eq(ONE_ETHER.mul(0));
          expect(await spaceCoin.balanceOf(david.address)).to.equal((ONE_TOKEN.mul(5000)));     
        });
  
        it("Emits a Redeem event after tokens are redeemed", async () => {
          await expect(spaceCoinICO.connect(charles).redeem())
            .to.emit(spaceCoinICO, "Redeem")
            .withArgs(charles.address, ONE_ETHER.mul(7500));
        });

        it("Allows contributions up to funding limit", async () => {
           // get to 30k ETH
           await bulkContributeEthInThousands(27);
           await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(500)}))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(bob.address, ONE_ETHER.mul(500), ONE_ETHER.mul(500), false, true);
           await checkFunds(ONE_ETHER.mul(30000));
        });

        it("Allows contributions up to funding limit with excess refund", async () => {
           // get to 30k ETH
           await bulkContributeEthInThousands(27);
           await expect(spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(1000)}))
            .to.emit(spaceCoinICO, "Contribute")
            .withArgs(bob.address, ONE_ETHER.mul(500), ONE_ETHER.mul(500), false, true);
           await checkFunds(ONE_ETHER.mul(30000));

           expect(await waffle.provider.getBalance(spaceCoinICO.address)).to.equal(ONE_ETHER.mul(30_000));
        });

        // 2500
        it("Blocks contributions above funding round limit", async () => {
          // get to 30k ETH
          await bulkContributeEthInThousands(27);
          await spaceCoinICO.connect(bob).contribute({value: ONE_ETHER.mul(500)});
          // console.log('totalCOntributions', await spaceCoinICO.fundMax());
          await checkFunds(ONE_ETHER.mul(30000));

          await expect(spaceCoinICO.connect(alice).contribute({value: ONE_ETHER}))
            .to.be.revertedWith(`reverted with custom error 'FundingRoundFilled("${alice.address}", 2)'`)
        });
      });
    });

    describe("Withdrawals", () => {

      beforeEach(async () => {
        // move to general phase
        await spaceCoinICO.advance(0);

        await spaceCoinICO.connect(frank).contribute({value: ONE_ETHER});

        expect(await waffle.provider.getBalance(spaceCoinICO.address)).to.equal(ONE_ETHER);
      });

      it("No one can withdraw before OPEN phase", async () => {
        await expect(spaceCoinICO.connect(frank).withdraw(ONE_ETHER.div(2), frank.address))
          .to.be.revertedWith("CANNOT_WITHDRAW");
        
        await expect(spaceCoinICO.connect(treasury).withdraw(ONE_ETHER.div(2), spaceCoinICO.address))
        .to.be.revertedWith("CANNOT_WITHDRAW");
      });

      it("Treasury is allowed to withdraw funds", async () => {
        // advance to open phase
        await spaceCoinICO.advance(1);

        const beforeTreasuryBalance = await waffle.provider.getBalance(treasury.address);
        const beforeICOBalance = await waffle.provider.getBalance(spaceCoinICO.address)

        await spaceCoinICO.connect(treasury).withdraw(ONE_ETHER, treasury.address);
        
        const afterICOBalance = await waffle.provider.getBalance(spaceCoinICO.address);
        const afterTreasuryBalance = await waffle.provider.getBalance(treasury.address);

        expect(beforeICOBalance.sub(afterICOBalance)).to.equal(ONE_ETHER);
        expect(afterTreasuryBalance.sub(beforeTreasuryBalance)).to.be.gt(ethers.utils.parseEther("0.999"));
      });

      it("Treasury cannot withdraw more funds than it raised", async () => {
         // advance to open phase
         await spaceCoinICO.advance(1);

         await expect(spaceCoinICO.connect(treasury).withdraw(ONE_ETHER.mul(2), treasury.address))
          .to.be.revertedWith("CANNOT_WITHDRAW");
      });

      it("Prevents anyone else from withdrawing funds", async () => {
         // advance to open phase
         await spaceCoinICO.advance(1);

         await expect(spaceCoinICO.connect(frank).withdraw(ONE_ETHER.div(2), frank.address))
         .to.be.revertedWith("CANNOT_WITHDRAW");
      });
    });
  });
});