// ----------------------------------------------------------------------------
// REQUIRED: Instructions
// ----------------------------------------------------------------------------
/*
  For this first project, we've provided a significant amount of scaffolding
  in your test suite. We've done this to:

    1. Set expectations, by example, of where the bar for testing is.
    2. Encourage more students to embrace an Advanced Typescript Hardhat setup.
    3. Reduce the amount of time consumed this week by "getting started friction".

  Please note that:

    - We will not be so generous on future projects!
    - The tests provided are about ~90% complete.
    - IMPORTANT:
      - We've intentionally left out some tests that would reveal potential
        vulnerabilities you'll need to identify, solve for, AND TEST FOR!

      - Failing to address these vulnerabilities will leave your contracts
        exposed to hacks, and will certainly result in extra points being
        added to your micro-audit report! (Extra points are _bad_.)

  Your job (in this file):

    - DO NOT delete or change the test names for the tests provided
    - DO complete the testing logic inside each tests' callback function
    - DO add additional tests to test how you're securing your smart contracts
         against potential vulnerabilties you identify as you work through the
         project.

    - You will also find several places where "FILL_ME_IN" has been left for
      you. In those places, delete the "FILL_ME_IN" text, and replace with
      whatever is appropriate.
*/
// ----------------------------------------------------------------------------

import { expect } from "chai";
import { ethers, network, waffle } from "hardhat";
import { BigNumber } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Project, ProjectFactory, ProjectFactory__factory } from "../typechain";

// ----------------------------------------------------------------------------
// OPTIONAL: Constants and Helper Functions
// ----------------------------------------------------------------------------
// We've put these here for your convenience. Feel free to use them if they
// are helpful!
const SECONDS_IN_DAY: number = 60 * 60 * 24;
const ONE_ETHER: BigNumber = ethers.utils.parseEther("1");

// Bump the timestamp by a specific amount of seconds
const timeTravel = async (seconds: number) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  // https://hardhat.org/hardhat-network/reference#evm_mine
  await network.provider.send("evm_mine");
};

// Or, set the time to be a specific amount (in seconds past epoch time)
const setBlockTimeTo = async (seconds: number) => {
  await network.provider.send("evm_setNextBlockTimestamp", [seconds]);
  await network.provider.send("evm_mine");
};
// ----------------------------------------------------------------------------

describe("Crowdfundr", () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let ProjectFactory: ProjectFactory__factory;
  let projectFactory: ProjectFactory;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    // NOTE: You may need to pass arguments to the `deploy` function if your
    //       ProjectFactory contract's constructor has input parameters
    ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    projectFactory =
      (await ProjectFactory.deploy(/* FILL_ME_IN: */)) as ProjectFactory;
    await projectFactory.deployed();
  });

  describe("ProjectFactory: Additional Tests", () => {
    /* 
      TODO: You may add additional tests here if you need to

      NOTE: If you wind up writing Solidity code to protect against a
            vulnerability that is not tested for below, you should add
            at least one test here.

      DO NOT: Delete or change the test names for the tests provided below
    */

      it.only("Rejects registration for project goal less than 0.01 ETH", async () => {
        await expect(projectFactory.create(ethers.utils.parseEther('0.009'), "Charity: Water", "WTR"))
          .to.be.revertedWith("Project goal must be >= 0.01 Ether");
      });

      it.only("Accepts a registration for project goal of exactly 0.01 ETH", async () => {
        const txReceiptUnresolved = await projectFactory.create(ethers.utils.parseEther('1'), "Charity: Water", "WTR");
        const txReceipt = await txReceiptUnresolved.wait();
        const projectAddress1 = txReceipt.events![0].args![0];
        expect(typeof(projectAddress1)).to.equal("string");
      });
  });

  describe("ProjectFactory", () => {
    it.only("Deploys a contract", () => {
      expect(projectFactory.address).to.be.ok;
    });

    it.only("Can register a single project", async () => {
      // register project
      const txReceiptUnresolved = await projectFactory.create(ethers.utils.parseEther('1'), "Charity: Water", "WTR");
      const txReceipt = await txReceiptUnresolved.wait();
      const projectAddress1 = txReceipt.events![0].args![0];
      const project1 = await ethers.getContractAt("Project", projectAddress1);

      // check that projects state variable includes the recently deployed project
      expect(await projectFactory.allProjects()).to.deep.equal([project1.address])
    });

    it.only("Can register multiple projects", async () => {
      // register project1
      const txReceiptUnresolved1 = await projectFactory.create(ethers.utils.parseEther('1'), "Charity: Water", "WTR");
      const txReceipt1 = await txReceiptUnresolved1.wait();
      const projectAddress1 = txReceipt1.events![0].args![0];
      const project1 = await ethers.getContractAt("Project", projectAddress1);

      // register project2
      const txReceiptUnresolved2 = await projectFactory.create(ethers.utils.parseEther('1'), "Mercy Ships", "MERCY");
      const txReceipt2 = await txReceiptUnresolved2.wait();
      const projectAddress2 = txReceipt2.events![0].args![0];
      const project2 = await ethers.getContractAt("Project", projectAddress2);

      // register project3
      const txReceiptUnresolved3 = await projectFactory.create(ethers.utils.parseEther('1'), "Charity: Water", "WTR");
      const txReceipt3 = await txReceiptUnresolved3.wait();
      const projectAddress3 = txReceipt3.events![0].args![0];
      const project3 = await ethers.getContractAt("Project", projectAddress3);

      expect(await projectFactory.allProjects()).to.deep.equal([project1.address, project2.address, project3.address]);
    });

    it.only("Registers projects with the correct owner", async () => {
       const txReceiptUnresolved = await projectFactory.connect(alice).create(ethers.utils.parseEther('1'), "Charity: Water", "WTR");
       const txReceipt = await txReceiptUnresolved.wait();
       const projectAddress = txReceipt.events![0].args![0];
       const project = await ethers.getContractAt("Project", projectAddress);

       expect(await project.creator()).to.equal(alice.address);
    });

    it.only("Registers projects with a preset funding goal (in units of ether)", async () => {
      const txReceiptUnresolved = await projectFactory.connect(alice).create(ONE_ETHER.mul(2), "Charity: Water", "WTR");
      const txReceipt = await txReceiptUnresolved.wait();
      const projectAddress = txReceipt.events![0].args![0];
      const project = await ethers.getContractAt("Project", projectAddress);

      expect(await project.fundGoal()).to.equal(ONE_ETHER.mul(2));
    });

    it.only('Emits a "Project Created" event after registering a project', async () => {
      await expect(projectFactory.connect(alice).create(ONE_ETHER.mul(2), "Charity: Water", "WTR"))
        .to.emit(projectFactory, 'ProjectCreated');
    });

    it.only("Allows multiple contracts to accept ETH simultaneously", async () => {
        // register project1
        const txReceiptUnresolved1 = await projectFactory.create(ONE_ETHER, "Charity: Water", "WTR");
        const txReceipt1 = await txReceiptUnresolved1.wait();
        const projectAddress1 = txReceipt1.events![0].args![0];
        const project1 = await ethers.getContractAt("Project", projectAddress1);
  
        // register project2
        const txReceiptUnresolved2 = await projectFactory.create(ONE_ETHER, "Mercy Ships", "MERCY");
        const txReceipt2 = await txReceiptUnresolved2.wait();
        const projectAddress2 = txReceipt2.events![0].args![0];
        const project2 = await ethers.getContractAt("Project", projectAddress2);
  
        // register project3
        const txReceiptUnresolved3 = await projectFactory.create(ONE_ETHER, "New Story", "STORY");
        const txReceipt3 = await txReceiptUnresolved3.wait();
        const projectAddress3 = txReceipt3.events![0].args![0];
        const project3 = await ethers.getContractAt("Project", projectAddress3);

        await project1.connect(alice).contribute({ value: ONE_ETHER.div(2) });
        await project2.connect(bob).contribute({ value: ONE_ETHER.div(2) });
        await project3.connect(alice).contribute({ value: ONE_ETHER.div(4) });

        expect(await project1.contributions(alice.address)).to.equal(ONE_ETHER.div(2));
        expect(await waffle.provider.getBalance(project1.address)).to.equal(ONE_ETHER.div(2));

        expect(await project2.contributions(bob.address)).to.equal(ONE_ETHER.div(2));
        expect(await waffle.provider.getBalance(project2.address)).to.equal(ONE_ETHER.div(2));

        expect(await project3.contributions(alice.address)).to.equal(ONE_ETHER.div(4));
        expect(await waffle.provider.getBalance(project3.address)).to.equal(ONE_ETHER.div(4));


    });
  });

  describe("Project: Additional Tests", () => {
    let projectAddress: string;
    let project: Project;

    beforeEach(async () => {
      // TODO: Your ProjectFactory contract will need a `create` method, to
      //       create new Projects

      const txReceiptUnresolved = await projectFactory.create(ethers.utils.parseEther('1'), "Charity: Water", "WTR");
      const txReceipt = await txReceiptUnresolved.wait();
      projectAddress = txReceipt.events![0].args![0];
      project = await ethers.getContractAt("Project", projectAddress);
      
    });
    /* 
      TODO: You may add additional tests here if you need to

      NOTE: If you wind up protecting against a vulnerability that is not
            tested for below, you should add at least one test here.

      DO NOT: Delete or change the test names for the tests provided below
    */

      describe("Withdrawals", () => {
        it.only("Prevents the creator from withdrawing more than the contribution balance after an earlier withdraw", async () => {
          await project.connect(bob).contribute({value: ONE_ETHER});

          await project.connect(deployer).withdraw(ONE_ETHER.div(2));
          await expect(project.connect(deployer).withdraw(ONE_ETHER))
            .to.be.revertedWith("Withdrawal exceeds amount available");
        });

        it.only("Creator cannot withdraw from a cancelled project", async () => {
            await project.connect(deployer).cancel();
            await expect(project.connect(deployer).withdraw(ONE_ETHER))
            .to.be.revertedWith("You cannot withdraw from a failed or cancelled project!");
        });

      });

      describe("Refunds", () => {
        it.only("Prevents contributor refund if there is nothing to be refunded", async () => {
          timeTravel(SECONDS_IN_DAY*30);
  
          await expect(project.connect(alice).refund())
            .to.be.revertedWith("You have no outstanding credit and are not entitled to a refund");
        });
  
        it.only("Prevents contributor from being refunded more than once", async () => {
          project.connect(alice).refund()
          timeTravel(SECONDS_IN_DAY*30);
          expect(project.connect(alice).refund())
            .to.be.revertedWith("You have no outstanding credit and are not entitled to a refund");
        });

        it.only("Contributor can be refunded from a cancelled project", async () => {
          project.connect(alice).refund()
          timeTravel(SECONDS_IN_DAY*30);
          expect(project.connect(alice).refund())
            .to.be.revertedWith("You have no outstanding credit and are not entitled to a refund");
        });
      });


      describe("Cancellation", () => {
    
        it.only("Prevent non-creators from cancelling project", async () => {
          await expect(project.connect(alice).cancel())
            .to.be.revertedWith("You are not a creator and cannot cancel the project");
        });

        it.only("Prevent double cancellation of project", async () => {
          await project.connect(deployer).cancel()
          await expect(project.connect(deployer).cancel())
            .to.be.revertedWith("Project must be active to be cancelled");
        });

        it("Does not allow creator to cancel the project if funding goal has been reached ", async () => {
          await project.connect(alice).contribute({value: ONE_ETHER});
          await expect(project.connect(deployer).cancel())
            .to.be.revertedWith("Project must be active to be cancelled");
        });

  
       
      });

      describe("NFT badges", () => {
        beforeEach(async () => {
          const txReceiptUnresolved = await projectFactory.create(ethers.utils.parseEther('10'), "Charity: Water", "WTR");
          const txReceipt = await txReceiptUnresolved.wait();
          projectAddress = txReceipt.events![0].args![0];
          project = await ethers.getContractAt("Project", projectAddress);
        });

        it.only("Mint multiple NFT badges at once if contribution gte 2 ETH", async () => {
          await project.connect(alice).contribute({value: ethers.utils.parseEther("3.5")});
          expect(await project.balanceOf(alice.address)).to.equal(3);
          expect(await project.ownerOf(0)).to.equal(alice.address);
          expect(await project.ownerOf(1)).to.equal(alice.address);
          expect(await project.ownerOf(2)).to.equal(alice.address);
        });

        it.only("Awards different contributors with different NFTs for contributions to different projects", async () => {
          const txReceiptUnresolved2 = await projectFactory.create(ethers.utils.parseEther('10'), "Mercy Ships", "MERCY");
          const txReceipt2 = await txReceiptUnresolved2.wait();
          const projectAddress2 = txReceipt2.events![0].args![0];
          const project2 = await ethers.getContractAt("Project", projectAddress2);
          
          await expect(project2.connect(alice).contribute({value: ONE_ETHER.mul(1) }))
            .to.emit(project2, "Transfer")
            .withArgs(ethers.constants.AddressZero, alice.address, 0);
          expect(await project2.balanceOf(alice.address)).to.equal(1);
          expect(await project2.ownerOf(0)).to.equal(alice.address);
  
          await expect(project.connect(bob).contribute({value: ONE_ETHER.mul(1) }))
            .to.emit(project, "Transfer")
            .withArgs(ethers.constants.AddressZero, bob.address, 0);
          expect(await project.balanceOf(bob.address)).to.equal(1);
          expect(await project.ownerOf(0)).to.equal(bob.address);
        });

        it.only("Awards different contributors with different NFTs for contributions to same projects", async () => {
           
          await expect(project.connect(alice).contribute({value: ONE_ETHER.mul(1) }))
            .to.emit(project, "Transfer")
            .withArgs(ethers.constants.AddressZero, alice.address, 0);
          expect(await project.balanceOf(alice.address)).to.equal(1);
          expect(await project.ownerOf(0)).to.equal(alice.address);
  
          await expect(project.connect(bob).contribute({value: ONE_ETHER.mul(1) }))
            .to.emit(project, "Transfer")
            .withArgs(ethers.constants.AddressZero, bob.address, 1);
          expect(await project.balanceOf(bob.address)).to.equal(1);
          expect(await project.ownerOf(1)).to.equal(bob.address);
        });
      });

     


     

  });

  describe("Project", () => {
    let projectAddress: string;
    let project: Project;

    beforeEach(async () => {
      // TODO: Your ProjectFactory contract will need a `create` method, to
      //       create new Projects

      const txReceiptUnresolved = await projectFactory.create(ethers.utils.parseEther('1'), "Charity: Water", "WTR");
      const txReceipt = await txReceiptUnresolved.wait();
      projectAddress = txReceipt.events![0].args![0];
      project = await ethers.getContractAt("Project", projectAddress);
      
    });

    describe("Contributions", () => {
      describe("Contributors", () => {
        it("Allows the creator to contribute", async () => {
          project.connect(deployer).contribute({ value: ONE_ETHER.div(2) });
          expect(await project.contributions(deployer.address)).to.equal(ONE_ETHER.div(2));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.div(2));
        });

        it("Allows any EOA to contribute", async () => {
          project.connect(bob).contribute({ value: ONE_ETHER.div(2) });
          expect(await project.contributions(bob.address)).to.equal(ONE_ETHER.div(2));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.div(2));
        });

        it("Allows an EOA to make many separate contributions", async () => {
          project.connect(bob).contribute({ value: ONE_ETHER.div(4) });
          expect(await project.contributions(bob.address)).to.equal(ONE_ETHER.div(4));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.div(4));

          project.connect(bob).contribute({ value: ONE_ETHER.div(4) });
          expect(await project.contributions(bob.address)).to.equal(ONE_ETHER.div(2));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.div(2));
        });

        it('Emits a "ProjectContribution" event after a contribution is made', async () => {
          await expect(project.connect(alice).contribute( { value: ONE_ETHER }))
            .to.emit(project, "ProjectContribution")
            .withArgs(alice.address, ONE_ETHER);
        });
      });

      describe("Minimum ETH Per Contribution", () => {
        it("Reverts contributions below 0.01 ETH", async () => {
          await expect(project.connect(alice).contribute( { value: ONE_ETHER.div(101) }))
          .to.be.revertedWith("Project contribution must be at least 0.01 ETH");
        });

        it.only("Accepts contributions of exactly 0.01 ETH", async () => {
          await expect(project.connect(alice).contribute( { value: ONE_ETHER.div(100) }));
          expect(await project.contributions(alice.address)).to.equal(ONE_ETHER.div(100));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.div(100));
        });
      });

      describe("Final Contributions", () => {
        it.only("Allows the final contribution to exceed the project funding goal", async () => {
          // Note: After this contribution, the project is fully funded and should not
          //       accept any additional contributions. (See next test.)
          await expect(project.connect(alice).contribute( { value: ONE_ETHER.mul(2) }));
          expect(await project.contributions(alice.address)).to.equal(ONE_ETHER.mul(2));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.mul(2));
        });

        it.only("Prevents additional contributions after a project is fully funded", async () => {
          await expect(project.connect(alice).contribute( { value: ONE_ETHER.mul(2) }));
          await expect(project.connect(bob).contribute( { value: ONE_ETHER }))
            .to.be.revertedWith("You cannot contribute because project is no longer active");
        });

        it.only("Prevents additional contributions after 30 days have passed since Project instance deployment", async () => {
          timeTravel(SECONDS_IN_DAY * 30);
          await expect(project.connect(alice).contribute( {value: ONE_ETHER.mul(100) }))
            .to.be.revertedWith("You cannot contribute because project is no longer active");
        });
      });
    });

    describe("Withdrawals", () => {
      describe("Project Status: Active", () => {
        it.only("Prevents the creator from withdrawing any funds", async () => {
          await project.connect(alice).contribute({ value: ONE_ETHER.div(2) });

          await expect(project.connect(deployer).withdraw(ONE_ETHER.div(2)))
            .to.be.revertedWith("Cannot withdraw funds while project is active")
        });

        it.only("Prevents contributors from withdrawing any funds", async () => {
          await project.connect(alice).contribute({ value: ONE_ETHER.div(2) });

          await expect(project.connect(alice).withdraw(ONE_ETHER.div(2)))
            .to.be.revertedWith("Only the creator can withdraw funds")
        });

        it.only("Prevents non-contributors from withdrawing any funds", async () => {
          await project.connect(alice).contribute({ value: ONE_ETHER.div(2) });

          await expect(project.connect(bob).withdraw(ONE_ETHER.div(2)))
            .to.be.revertedWith("Only the creator can withdraw funds")
        });
      });

      describe("Project Status: Success", () => {
        beforeEach(async () => {
          await project.connect(alice).contribute({ value: ONE_ETHER });
        });

        it.only("Allows the creator to withdraw some of the contribution balance", async () => {
          expect(await project.currentFundAmount()).to.equal(ONE_ETHER);

          const creatorBalance = await waffle.provider.getBalance(deployer.address);
          await project.connect(deployer).withdraw(ONE_ETHER.div(2));
          const creatorBalanceDiff = (await waffle.provider.getBalance(deployer.address)).sub(creatorBalance);

          expect(await project.currentFundAmount()).to.equal(ONE_ETHER.div(2));
          expect(creatorBalanceDiff).to.be.gt(ethers.utils.parseEther("0.49"));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.div(2));
        });

        it.only("Allows the creator to withdraw the entire contribution balance", async () => {
          const creatorBalance = await waffle.provider.getBalance(deployer.address);
          await project.connect(deployer).withdraw(ONE_ETHER);
          const creatorBalanceDiff = (await waffle.provider.getBalance(deployer.address)).sub(creatorBalance);

          expect(await project.currentFundAmount()).to.equal(0);
          expect(creatorBalanceDiff).to.be.gt(ethers.utils.parseEther("0.99"));
          expect(await waffle.provider.getBalance(project.address)).to.equal(0);
        });

        it.only("Allows the creator to make multiple withdrawals", async () => {
          expect(await project.currentFundAmount()).to.equal(ONE_ETHER);
          let initialCreatorBalance: BigNumber;
          let creatorBalanceDiff: BigNumber;

          // first withdrawal
          initialCreatorBalance = await waffle.provider.getBalance(deployer.address);
          await project.connect(deployer).withdraw(ONE_ETHER.div(4));
          creatorBalanceDiff = (await waffle.provider.getBalance(deployer.address)).sub(initialCreatorBalance);

          expect(creatorBalanceDiff).to.be.gt(ethers.utils.parseEther("0.249"));
          expect(await project.currentFundAmount()).to.equal(ethers.utils.parseEther("0.75"));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ethers.utils.parseEther("0.75"));

          // second withdrawal
          await project.connect(deployer).withdraw(ONE_ETHER.div(4));
          creatorBalanceDiff = (await waffle.provider.getBalance(deployer.address)).sub(initialCreatorBalance);

          expect(creatorBalanceDiff).to.be.gt(ethers.utils.parseEther("0.499"));
          expect(await project.currentFundAmount()).to.equal(ONE_ETHER.div(2));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.div(2));

          // third withdrawal
          await project.connect(deployer).withdraw(ONE_ETHER.div(4));
          creatorBalanceDiff = (await waffle.provider.getBalance(deployer.address)).sub(initialCreatorBalance);

          expect(creatorBalanceDiff).to.be.gt(ethers.utils.parseEther("0.749"));
          expect(await project.currentFundAmount()).to.equal(ONE_ETHER.div(4));
          expect(await waffle.provider.getBalance(project.address)).to.equal(ONE_ETHER.div(4));
        });

        it.only("Prevents the creator from withdrawing more than the contribution balance", async () => {
          const creatorBalance = await waffle.provider.getBalance(deployer.address);
          await expect(project.connect(deployer).withdraw(ONE_ETHER.mul(2)))
            .to.be.revertedWith("Withdrawal exceeds amount available");
        });

        it.only('Emits a "ProjectWithdrawal" event after a withdrawal is made by the creator', async () => {
          await expect(project.connect(deployer).withdraw(ONE_ETHER.div(2)))
            .to.emit(project, "ProjectWithdrawal")
            .withArgs(ONE_ETHER.div(2));
        });

        it.only("Prevents contributors from withdrawing any funds", async () => {
          await expect(project.connect(alice).withdraw(ONE_ETHER))
            .to.be.revertedWith("Only the creator can withdraw funds");
        });

        it.only("Prevents non-contributors from withdrawing any funds", async () => {
          await expect(project.connect(alice).withdraw(ONE_ETHER))
            .to.be.revertedWith("Only the creator can withdraw funds");
        });
      });

      describe("Project Status: Failure", () => {

        beforeEach(async () => {
          timeTravel(SECONDS_IN_DAY*30);
        });

        it.only("Prevents the creator from withdrawing any funds (if not a contributor)", async () => {
          await expect(project.connect(deployer).withdraw(ONE_ETHER))
            .to.be.revertedWith("You cannot withdraw from a failed or cancelled project!");
        });

        it.only("Prevents contributors from withdrawing any funds (though they can still refund)", async () => {
          await expect(project.connect(alice).withdraw(ONE_ETHER))
          .to.be.revertedWith("Only the creator can withdraw funds");
        });

        it("Prevents non-contributors from withdrawing any funds", async () => {
          await expect(project.connect(alice).withdraw(ONE_ETHER))
          .to.be.revertedWith("Only the creator can withdraw funds");
        });
      });
    });

    describe("Refunds", () => {
      beforeEach(async () => {
        await project.connect(alice).contribute({value: ONE_ETHER.div(4)});
        await project.connect(bob).contribute({value: ONE_ETHER.div(4)});
      })

      it.only("Allows contributors to be refunded when a project fails", async () => {
        timeTravel(SECONDS_IN_DAY*30);

        // refund alice
        const aliceInitialBalance = await waffle.provider.getBalance(alice.address);
        await project.connect(alice).refund();
        
        expect(await project.connect(alice).contributions(alice.address)).to.equal(0);
        expect(await project.currentFundAmount()).to.equal(ethers.utils.parseEther("0.25"));
        expect((await waffle.provider.getBalance(alice.address)).sub(aliceInitialBalance))
          .to.be.gt(ethers.utils.parseEther("0.249"));
        expect((await waffle.provider.getBalance(project.address)))
          .to.equal(ethers.utils.parseEther("0.25"))

        // refund bob
        const bobInitialBalance = await waffle.provider.getBalance(alice.address);
        await project.connect(bob).refund();
        
        expect(await project.connect(bob).contributions(bob.address)).to.equal(0);
        expect(await project.currentFundAmount()).to.equal(0);
        expect((await waffle.provider.getBalance(bob.address)).sub(bobInitialBalance))
          .to.be.gt(ethers.utils.parseEther("0.249"));
        expect((await waffle.provider.getBalance(project.address)))
          .to.equal(0)
      });

      it.only("Prevents contributors from being refunded if a project has not failed", async () => {
        await expect(project.connect(alice).refund())
          .to.be.revertedWith("Project has not failed or been cancelled. You can't currently be refunded");
      });

      it.only('Emits a "ProjectRefund" event after a a contributor receives a refund', async () => {
        timeTravel(SECONDS_IN_DAY*30);
        await expect(project.connect(alice).refund())
          .to.emit(project, "ProjectRefund")
          .withArgs(alice.address, ONE_ETHER.div(4));
      });
    });

    describe("Cancelations (creator-triggered project failures)", () => {
      it.only("Allows the creator to cancel the project if < 30 days since deployment has passed ", async () => {
        timeTravel(SECONDS_IN_DAY*29);
        await project.connect(deployer).cancel();
        expect(await project.status()).to.equal(2)
      });

      it.only("Prevents the creator from canceling the project if at least 30 days have passed", async () => {
        timeTravel(SECONDS_IN_DAY*30);
        await expect(project.connect(deployer).cancel())
          .to.be.revertedWith("Project must be active to be cancelled");
      });

      it.only('Emits a "ProjectCancelled" event after a project is cancelled by the creator', async () => {
        await expect(project.cancel())
          .to.emit(project, "ProjectCancelled");
      });
    });

    describe("NFT Contributor Badges", () => {
      // increase project goal in order to test nft minting functionality
      beforeEach(async () => {
        const txReceiptUnresolved = await projectFactory.create(ethers.utils.parseEther('10'),  "Mercy Ships", "MERCY");
        const txReceipt = await txReceiptUnresolved.wait();
        projectAddress = txReceipt.events![0].args![0];
        project = await ethers.getContractAt("Project", projectAddress);
      });

      // how to get tokenId?
      it.only("Awards a contributor with a badge when they make a single contribution of at least 1 ETH", async () => {
        await expect(project.connect(alice).contribute({value: ONE_ETHER}))
          .to.emit(project, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 0)
        expect(await project.balanceOf(alice.address)).to.equal(1);
        expect(await project.ownerOf(0)).to.equal(alice.address);
      });

      it.only("Awards a contributor with a badge when they make multiple contributions to a single project that sum to at least 1 ETH", async () => {
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.4") }));
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.4") }));

        expect(await project.balanceOf(alice.address)).to.equal(0);

        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.3") }))
          .to.emit(project, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 0)
        expect(await project.balanceOf(alice.address)).to.equal(1);
      });

      it.only("Does not award a contributor with a badge if their total contribution to a single project sums to < 1 ETH", async () => {
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.4") }));
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.4") }));
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.1999") }));

        expect(await project.balanceOf(alice.address)).to.equal(0);
      });

      it.only("Awards a contributor with a second badge when their total contribution to a single project sums to at least 2 ETH", async () => {
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.4") }));
        expect(await project.balanceOf(alice.address)).to.equal(0);
        
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.9") }))
          .to.emit(project, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 0);
        expect(await project.balanceOf(alice.address)).to.equal(1);
        expect(await project.ownerOf(0)).to.equal(alice.address);

        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.6") }));
        expect(await project.balanceOf(alice.address)).to.equal(1);

        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.1") }))
          .to.emit(project, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 1);
        expect(await project.balanceOf(alice.address)).to.equal(2);
        expect(await project.ownerOf(1)).to.equal(alice.address);
      });

      it("Does not award a contributor with a second badge if their total contribution to a single project is > 1 ETH but < 2 ETH", async () => {
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.4") }));
        expect(await project.balanceOf(alice.address)).to.equal(0);
        
        await expect(project.connect(alice).contribute({value: ethers.utils.parseEther("0.9") }))
          .to.emit(project, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 0);
        expect(await project.balanceOf(alice.address)).to.equal(1);
        expect(await project.ownerOf(0)).to.equal(alice.address);
      });

      it.only("Awards contributors with different NFTs for contributions to different projects", async () => {
        const txReceiptUnresolved2 = await projectFactory.create(ethers.utils.parseEther('10'), "New Story", "STORY");
        const txReceipt2 = await txReceiptUnresolved2.wait();
        const projectAddress2 = txReceipt2.events![0].args![0];
        const project2 = await ethers.getContractAt("Project", projectAddress2);
        
        await expect(project2.connect(alice).contribute({value: ONE_ETHER.mul(1) }))
          .to.emit(project2, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 0);
        expect(await project2.balanceOf(alice.address)).to.equal(1);
        expect(await project2.ownerOf(0)).to.equal(alice.address);

        await expect(project.connect(alice).contribute({value: ONE_ETHER.mul(1) }))
          .to.emit(project, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 0);
        expect(await project.balanceOf(alice.address)).to.equal(1);
        expect(await project.ownerOf(0)).to.equal(alice.address);
      });

      it.only("Allows contributor badge holders to trade the NFT to another address", async () => {
        await expect(project.connect(alice).contribute({value: ONE_ETHER.mul(1) }))
          .to.emit(project, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 0);
        expect(await project.balanceOf(alice.address)).to.equal(1);
        expect(await project.ownerOf(0)).to.equal(alice.address);

        await expect(project.connect(alice).transferFrom(alice.address, bob.address, 0))
          .to.emit(project, "Transfer")
          .withArgs(alice.address, bob.address, 0);
        
        expect(await project.balanceOf(alice.address)).to.equal(0);
        expect(await project.balanceOf(bob.address)).to.equal(1);
        expect(await project.ownerOf(0)).to.equal(bob.address);
      });

      it.only("Allows contributor badge holders to trade the NFT to another address even after its related project fails", async () => {
        await expect(project.connect(alice).contribute({value: ONE_ETHER.mul(1) }))
          .to.emit(project, "Transfer")
          .withArgs(ethers.constants.AddressZero, alice.address, 0);
        expect(await project.balanceOf(alice.address)).to.equal(1);
        expect(await project.ownerOf(0)).to.equal(alice.address);

        await expect(project.connect(deployer).cancel())
          .to.emit(project, "ProjectCancelled");

        await expect(project.connect(alice).transferFrom(alice.address, bob.address, 0))
          .to.emit(project, "Transfer")
          .withArgs(alice.address, bob.address, 0);
      
        expect(await project.balanceOf(alice.address)).to.equal(0);
        expect(await project.balanceOf(bob.address)).to.equal(1);
        expect(await project.ownerOf(0)).to.equal(bob.address);
      });
    });
  });
});
