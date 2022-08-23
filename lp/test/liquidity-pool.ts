import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { ethers, waffle } from "hardhat";
import { ETHSPCPool, ETHSPCPool__factory, SpaceCoin, SpaceCoinICO, SpaceCoinICO__factory, SpaceRouter, SpaceRouter__factory } from "../typechain";

const { utils: {parseUnits, parseEther}} = ethers;
// treasury has 350_000 spacecoin
// maximum ether we raised was 30_000 ether
const ONE_LPT = BigNumber.from("1000000000000000000"); // 10^18
const ONE_SPC = BigNumber.from("1000000000000000000"); // 10^18
const ONE_ETHER = ethers.utils.parseEther("1");
const MIN_LIQ = 1_000;
const ZERO = BigNumber.from("0");
const parseToken = (amount: string) => {
  return parseUnits(amount, 18);
}

describe("Liquidity Pools", () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let mallory: SignerWithAddress;
  let treasury: SignerWithAddress;

  let spaceCoin: SpaceCoin;
  let spaceCoinAddress: string;

  let spaceCoinICOFactory: SpaceCoinICO__factory;
  let spaceCoinICO: SpaceCoinICO;

  let poolFactory: ETHSPCPool__factory;
  let pool: ETHSPCPool; 



  const deposit = async (depositor: SignerWithAddress, eth: BigNumber, spc: BigNumber) => {
    if(!eth.isZero()) {
      await pool.connect(depositor).sendETH({value: eth});
    }
    if(!spc.isZero()) {
      await spaceCoin.connect(depositor).transfer(pool.address, spc);
    }
  }

  const assertBalances = async (poolEth: BigNumber, poolSpc: BigNumber, depositorAddress: string, depositorLPT: BigNumber, totalLPTSupply: BigNumber) => {
    expect(await pool.balanceSPC()).to.equal(poolSpc);
    expect(await pool.balanceETH()).to.equal(poolEth);

    expect(await waffle.provider.getBalance(pool.address)).to.equal(poolEth);
    expect(await spaceCoin.balanceOf(pool.address)).to.equal(poolSpc);

    expect(await pool.balanceOf(depositorAddress)).to.equal(depositorLPT);
    expect(await pool.totalSupply()).to.equal(totalLPTSupply);
  }

  // let 

  beforeEach(async () => {
    [deployer, alice, bob, mallory, treasury] = await ethers.getSigners();

    spaceCoinICOFactory = await ethers.getContractFactory("SpaceCoinICO");

    spaceCoinICO = await spaceCoinICOFactory.deploy(treasury.address);
    await spaceCoinICO.deployed();

    const event = (await spaceCoinICO.queryFilter(spaceCoinICO.filters.SpaceCoinDeployed()));
    
    spaceCoinAddress = event[0].args[0];
    spaceCoin = await ethers.getContractAt("SpaceCoin", spaceCoinAddress);

    // before this, it's generic set up that could be seperated

    // go to open phase
    await spaceCoinICO.advance(0);
    await spaceCoinICO.advance(1);

    // alice contributes 2 ETH, returns 10 SPC
    await spaceCoinICO.connect(alice).contribute({value: ONE_ETHER.mul(2)});
    expect(await spaceCoin.balanceOf(alice.address)).to.equal(ONE_SPC.mul(10));

    poolFactory = await ethers.getContractFactory("ETHSPCPool");

    pool = await poolFactory.deploy(spaceCoin.address);

  });


describe("SpaceRouter", () => {

  let routerFactory: SpaceRouter__factory;
  let router: SpaceRouter;

  beforeEach(async () => {
    routerFactory = await ethers.getContractFactory("SpaceRouter");

    router = await routerFactory.deploy(spaceCoin.address, pool.address);
    await router.deployed();

    // after this, alice and bob both have 5 SPC
    await spaceCoin.connect(alice).transfer(bob.address, ONE_SPC.mul(5));

    await spaceCoinICO.connect(mallory).contribute({value: ONE_ETHER.mul(2)});
    expect(await spaceCoin.balanceOf(mallory.address)).to.equal(ONE_SPC.mul(10));
  });

  const addLiquidity = async (user: SignerWithAddress, desiredETH: BigNumber, desiredSPC: BigNumber, minETH: BigNumber, minSPC: BigNumber) => {
      
    // grant access to router to transfer SPC
    await spaceCoin.connect(user).approve(router.address, desiredSPC);
    
    // pay either while adding liquidity
    return router.connect(user).addLiquidity(user.address, desiredSPC, minETH, minSPC, {value:desiredETH});
  };

  // TODO: add emitting events
  describe("Add Liquidity", () => {
  

    describe("Initial Deposit", () => {
      it("Initial Deposit mints expected LP Tokens", async () => {
        const desiredETH = parseEther("0.01"), desiredSPC = parseToken("0.04");
        const minETH = desiredETH, minSPC = desiredSPC;
        await expect(addLiquidity(alice, desiredETH, desiredSPC, minETH, minSPC))
          .to.emit(pool, "Mint")
          .withArgs(router.address, alice.address, desiredETH, desiredSPC, parseToken("0.02").sub(MIN_LIQ));

        // assert alice has correct amount of LP tokens
        // assert that the pool has X and Y tokens

        await assertBalances(desiredETH, desiredSPC, alice.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));
      });
    });

    describe("Desired ETH Added", () => {


      it("Subsequent Deposit mints expected LP Tokens at desired ETH and SPC", async () => {
        const desiredETH = parseEther("0.01"), desiredSPC = parseToken("0.04");
        const minETH = desiredETH, minSPC = desiredSPC;
        // initial deposit
        await addLiquidity(alice, desiredETH, desiredSPC, minETH, minSPC);
        await assertBalances(desiredETH, desiredSPC, alice.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

        // second deposit
        await expect(addLiquidity(bob, desiredETH, desiredSPC, minETH, minSPC))
          .to.emit(pool, "Mint")
          .withArgs(router.address, bob.address, desiredETH, desiredSPC, parseToken("0.02"));

        await assertBalances(desiredETH.mul(2), desiredSPC.mul(2), bob.address, parseToken("0.02"), parseToken("0.04"));
      });

      it("Subsequent Deposit mints expected LP Tokens at desired ETH and >= min SPC", async () => {
        const desiredETH1 = parseEther("0.04"), desiredSPC1 = parseToken("0.01");
        const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
        // initial deposit
        await addLiquidity(alice, desiredETH1, desiredSPC1, minETH1, minSPC1);
        await assertBalances(desiredETH1, desiredSPC1, alice.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

        const desiredETH2 = parseEther("0.04"), desiredSPC2 = parseToken("0.04");
        // usually within a 5% tolerance of desired
        const minETH2 = parseToken("0.04"), minSPC2 = parseToken("0.01")
        const actualSPC2 = parseToken("0.01");

        // second deposit
        await expect(addLiquidity(bob, desiredETH2, desiredSPC2, minETH2, minSPC2))
          .to.emit(pool, "Mint")
          .withArgs(router.address, bob.address, desiredETH2, actualSPC2, parseToken("0.02"));

        await assertBalances(desiredETH1.mul(2), desiredSPC1.mul(2), bob.address, parseToken("0.02"), parseToken("0.04"));
      });


      it("Subsequent Deposit Reverts at desired ETH and actualSPC < minSPC", async () => {
        const desiredETH1 = parseEther("0.04"), desiredSPC1 = parseToken("0.01");
        const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
        // initial deposit
        await addLiquidity(alice, desiredETH1, desiredSPC1, minETH1, minSPC1);
        await assertBalances(desiredETH1, desiredSPC1, alice.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

        const desiredETH2 = parseEther("0.04"), desiredSPC2 = parseToken("0.04");
        // usually within a 5% tolerance of desired
        const minETH2 = parseToken("0.04"), minSPC2 = parseToken("0.011")

        // second deposit
        await expect(addLiquidity(bob, desiredETH2, desiredSPC2, minETH2, minSPC2))
          .to.be.revertedWith("NOT_ENOUGH_ETH_IN");
      });


    });

    describe("Desired SPC Taken", () => {

      it("Subsequent Deposit mints expected LP Tokens at desired ETH and SPC", async () => {
        const desiredETH = parseEther("0.04"), desiredSPC = parseToken("0.01");
        const minETH = desiredETH, minSPC = desiredSPC;
        // initial deposit
        await addLiquidity(alice, desiredETH, desiredSPC, minETH, minSPC);
        await assertBalances(desiredETH, desiredSPC, alice.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

        // second deposit
        await expect(addLiquidity(bob, desiredETH, desiredSPC, minETH, minSPC))
          .to.emit(pool, "Mint")
          .withArgs(router.address, bob.address, desiredETH, desiredSPC, parseToken("0.02"));

        await assertBalances(desiredETH.mul(2), desiredSPC.mul(2), bob.address, parseToken("0.02"), parseToken("0.04"));
      });


      it("Subsequent Deposit mints expected LP Tokens at desired SPC and >= min ETH", async () => {
        const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
        const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
        // initial deposit
        await addLiquidity(alice, desiredETH1, desiredSPC1, minETH1, minSPC1);
        await assertBalances(desiredETH1, desiredSPC1, alice.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

        const desiredETH2 = parseEther("0.04"), desiredSPC2 = parseToken("0.04");
        // usually within a 5% tolerance of desired
        const minETH2 = parseToken("0.01"), minSPC2 = parseToken("0.04")
        const actualETH2 = parseToken("0.01");

        // second deposit
        await expect(addLiquidity(bob, desiredETH2, desiredSPC2, minETH2, minSPC2))
          .to.emit(pool, "Mint")
          .withArgs(router.address, bob.address, actualETH2, desiredSPC2, parseToken("0.02"));

        await assertBalances(desiredETH1.mul(2), desiredSPC1.mul(2), bob.address, parseToken("0.02"), parseToken("0.04"));
      });


      it("Subsequent Deposit Reverts at desired SPC and actualETH < minETH", async () => {
        const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
        const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
        // initial deposit
        await addLiquidity(alice, desiredETH1, desiredSPC1, minETH1, minSPC1);
        await assertBalances(desiredETH1, desiredSPC1, alice.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

        const desiredETH2 = parseEther("0.04"), desiredSPC2 = parseToken("0.04");
        // usually within a 5% tolerance of desired
        const minETH2 = parseToken("0.011"), minSPC2 = parseToken("0.04")
        const actualETH2 = parseToken("0.01");

        // second deposit
        await expect(addLiquidity(bob, desiredETH2, desiredSPC2, minETH2, minSPC2))
          .to.be.revertedWith("NOT_ENOUGH_SPC_IN");
      });


    });

    describe("Space Tax On", () => {
      it("Reverts when you set minimum to desired", async () => {
        await spaceCoinICO.setTax(true);

         const desiredETH = parseEther("0.04"), desiredSPC = parseToken("0.01");
        const minETH = desiredETH, minSPC = desiredSPC;

        await expect(addLiquidity(alice, desiredETH, desiredSPC, minETH, minSPC))
          .to.be.revertedWith("MINIMUM_NOT_MET");
      });

      // x * 49/50 = 1

      it("First Deposit adds less SPC", async () => {
        const desiredETH = parseEther("10"), desiredSPC = parseToken("5");
        const minETH = desiredETH, minSPC = parseToken("4.9");

        await spaceCoinICO.setTax(true);

        // initial deposit
        await addLiquidity(alice, desiredETH, desiredSPC, minETH, minSPC);

        await assertBalances(desiredETH, parseToken("4.9"), alice.address, parseToken("7").sub(MIN_LIQ), parseToken("7"));
      });

      it("Subsequet Deposit adds less SPC and less ETH based on current ratio", async () => {
        const desiredETH = parseEther("0.04"), desiredSPC = parseToken("0.01");
        const minETH = desiredETH, minSPC = desiredSPC;
        // initial deposit
        await addLiquidity(alice, desiredETH, desiredSPC, minETH, minSPC);
        await assertBalances(desiredETH, desiredSPC, alice.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

        await spaceCoinICO.setTax(true);

        // second deposit
        await expect(addLiquidity(bob, desiredETH, desiredSPC, ZERO, ZERO))
          .to.emit(pool, "Mint")
          .withArgs(router.address, bob.address, parseEther("0.0392"), parseToken("0.0098"), parseToken("0.0196"));

        await assertBalances(parseEther("0.0792"), parseToken("0.0198"), bob.address, parseToken("0.0196"), parseToken("0.0396"));
      });

    });

    describe("Other", () => {

      describe("Initial Deposit", () => {

        it("Reverts when user did not transfer enough SPC", async () => {
          const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
          const minETH1 = desiredETH1, minSPC1 = desiredSPC1;

          await expect(router.connect(bob).addLiquidity(bob.address, desiredSPC1, minETH1, minSPC1, {value:desiredETH1}))
            .to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("Reverts when user specifies 0 SPC In", async () => {
          await expect(router.connect(bob).addLiquidity(bob.address, ZERO, 0, 0))
          .to.be.revertedWith("NO_LIQUIDITY_IN");

        });

        it("Reverts when user did not transfer any ETH", async () => {

          await expect(router.connect(bob).addLiquidity(bob.address, ONE_SPC, 0, 0))
            .to.be.revertedWith("NO_LIQUIDITY_IN");
        });

      });

      describe("Subsequent Deposit", () => {

        it("Reverts when user did not transfer enough SPC", async () => {
          const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
          const minETH1 = desiredETH1, minSPC1 = desiredSPC1;

          await addLiquidity(alice, desiredETH1, desiredSPC1, minETH1, minSPC1);

          await expect(router.connect(bob).addLiquidity(bob.address, desiredSPC1, minETH1, minSPC1, {value:desiredETH1}))
            .to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("Reverts when user specifies 0 SPC In", async () => {
          const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
          const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
          await addLiquidity(alice, desiredETH1, desiredSPC1, minETH1, minSPC1);

          await expect(router.connect(bob).addLiquidity(bob.address, ZERO, 0, 0))
          .to.be.revertedWith("ZERO_DEPOSIT");

        });

        it("Reverts when user did not transfer any ETH", async () => {
          const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
          const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
          await addLiquidity(alice, desiredETH1, desiredSPC1, minETH1, minSPC1);

          await expect(router.connect(bob).addLiquidity(bob.address, ONE_SPC, 0, 0))
            .to.be.revertedWith("ZERO_DEPOSIT");
        });

      });

    });

  }); 

  describe("Remove Liquidity", () => {
    beforeEach(async () => {
      const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
      const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
      await addLiquidity(alice, desiredETH1, desiredSPC1, minETH1, minSPC1);
    });

    it("Prevents user from claming more liquidity tokens than they have approved router for", async () => {
      await pool.connect(alice).approve(router.address, parseToken("0.01"));

      await expect(router.connect(alice).removeLiquidity(alice.address, parseToken("1"), 0, 0))
        .to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Prevents user from claiming liquidity tokens when they have approved router for zero", async () => {
      await expect(router.connect(bob).removeLiquidity(alice.address, parseToken("1"), 0, 0))
        .to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Prevents user from trying to burn 0 liquidity tokens", async () => {
      await expect(router.connect(bob).removeLiquidity(alice.address, 0, 0, 0))
      .to.be.revertedWith("NOTHING_TO_BURN");
    });

    it("Errors when minimum liquidity tokens expected is not met", async () => {
       // bob can add liquidity
       const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
       const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
       await addLiquidity(bob, desiredETH1, desiredSPC1, minETH1, minSPC1);
 
       await assertBalances(parseEther("0.02"), parseToken("0.08"), bob.address, parseToken("0.02"), parseToken("0.04"));
 
       // remove liquidity
       const burnAmount = parseToken("0.02");
       await pool.connect(bob).approve(router.address, burnAmount);
       await expect(router.connect(bob).removeLiquidity(bob.address, burnAmount, parseToken("0.011"), parseToken("0.04")))
        .to.be.revertedWith("SUPPLY_MORE_LIQUIDITY");

    });

    it("First depositor can remove liquidity tokens to receive ETH/SPC", async () => {
      // remove liquidity
      await pool.connect(alice).approve(router.address, parseToken("0.02").sub(MIN_LIQ));

      const burnAmount = parseToken("0.01");
      await router.connect(alice).removeLiquidity(alice.address, burnAmount, 0, 0);

      await assertBalances(parseEther("0.005"), parseToken("0.02"), alice.address, parseToken("0.01").sub(MIN_LIQ), parseToken("0.01"));
    });

    it("Subsequent depositor can remove liquidity tokens to receive ETH/SPC", async () => {
      // bob can add liquidity
      const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
      const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
      await addLiquidity(bob, desiredETH1, desiredSPC1, minETH1, minSPC1);

      await assertBalances(parseEther("0.02"), parseToken("0.08"), bob.address, parseToken("0.02"), parseToken("0.04"));

      // remove liquidity
      const burnAmount = parseToken("0.02");
      await pool.connect(bob).approve(router.address, burnAmount);
      await router.connect(bob).removeLiquidity(bob.address, burnAmount, 0, 0);

      await assertBalances(parseEther("0.01"), parseToken("0.04"), bob.address, ZERO, parseToken("0.02"));
    });

    // TODO: add emitting events for removign liquidity
    it("Subsequent depositor can remove liquidity tokens to receive ETH/SPC when received equal to minimum desired", async () => {
      // bob can add liquidity
      const desiredETH1 = parseEther("0.01"), desiredSPC1 = parseToken("0.04");
      const minETH1 = desiredETH1, minSPC1 = desiredSPC1;
      await addLiquidity(bob, desiredETH1, desiredSPC1, minETH1, minSPC1);

      await assertBalances(parseEther("0.02"), parseToken("0.08"), bob.address, parseToken("0.02"), parseToken("0.04"));

      // remove liquidity
      const burnAmount = parseToken("0.02");
      await pool.connect(bob).approve(router.address, burnAmount);
      await router.connect(bob).removeLiquidity(bob.address, burnAmount, parseToken("0.01"), parseToken("0.04"));

      await assertBalances(parseEther("0.01"), parseToken("0.04"), bob.address, ZERO, parseToken("0.02"));

   });

  });

  describe("Swap Liquidity", () => {

    describe("ETH => SPC", async () => {

      it("Prevents User From Swapping when Pool has Zero Liquidity", async () => {
        await expect(router.connect(alice).swapETHForSPC(alice.address, 0))
          .to.be.revertedWith("ZERO_LIQUIDITY");
      });

      it("User Swaps in ETH and gets expected SPC Out", async () => {
        const inETH = parseEther("0.01"), inSPC = parseToken("0.04");
        
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        const expectedSPCLeft = parseEther("0.0004");
        const expectedSPCReceived = inSPC.sub(expectedSPCLeft);

        await expect(router.connect(alice).swapETHForSPC(alice.address, expectedSPCReceived, {value: ONE_ETHER}))
          .to.emit(pool, "Swap")
          .withArgs(router.address, alice.address, ONE_ETHER, 0, 0, expectedSPCReceived);

        await assertBalances(parseEther("1.01"), expectedSPCLeft, alice.address, ZERO, parseToken("0.02"));

      });

      it("Reverts when User Swaps in ETH but SPC Out < minimum", async () => {
        const inETH = parseEther("0.01"), inSPC = parseToken("0.04");
        
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        const expectedSPCLeft = parseEther("0.0004");
        const expectedSPCReceived = inSPC.sub(expectedSPCLeft);

        await expect(router.connect(alice).swapETHForSPC(alice.address, expectedSPCReceived.add(1), {value: ONE_ETHER}))
          .to.be.revertedWith("SWAP_MORE_ETH");
      });

      it("User Swaps in ETH after someone donates ETH to pool and gets surplus SPC Out", async () => {
        const inETH = parseEther("0.01"), inSPC = parseToken("0.04");
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        // mallory donates ETH
        await pool.connect(mallory).sendETH({value: parseEther("0.99")});
        expect(await pool.balanceETH()).to.equal(inETH);
        expect(await waffle.provider.getBalance(pool.address)).to.equal(ONE_ETHER);

        const expectedSPCLeft = parseEther("0.0004");
        const expectedSPCReceived = inSPC.sub(expectedSPCLeft);

        // alice swaps 0.01 but it will be counted as 1 eth cause of mallory's donation
        await expect(router.connect(alice).swapETHForSPC(alice.address, expectedSPCReceived, {value: parseEther("0.01")}))
        .to.emit(pool, "Swap")
        .withArgs(router.address, alice.address, ONE_ETHER, 0, 0, expectedSPCReceived);

        await assertBalances(parseEther("1.01"), expectedSPCLeft, alice.address, ZERO, parseToken("0.02"));
      });

      // user does not get any extra, but LPs do!
      it("User Swaps in ETH after someone donates SPC to pool and gets expected SPC Out", async () => {
        const inETH = parseEther("0.01"), inSPC = parseToken("0.04");
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        // mallory donates SPC
        await spaceCoin.connect(mallory).transfer(pool.address, ONE_SPC);

        expect(await pool.balanceSPC()).to.equal(inSPC);
        expect(await spaceCoin.balanceOf(pool.address)).to.equal(ONE_SPC.add(inSPC));

        const expectedSPCLeft = parseEther("0.0004");
        const expectedSPCReceived = inSPC.sub(expectedSPCLeft);

        // alice swaps 0.01 but it will be counted as 1 eth cause of mallory's donation
        await expect(router.connect(alice).swapETHForSPC(alice.address, expectedSPCReceived, {value: ONE_ETHER}))
        .to.emit(pool, "Swap")
        .withArgs(router.address, alice.address, ONE_ETHER, 0, 0, expectedSPCReceived);

        await assertBalances(parseEther("1.01"), ONE_SPC.add(expectedSPCLeft), alice.address, ZERO, parseToken("0.02"));
      });

    });

    describe("SPC => ETH", async () => {

      //  it.only("TESTTESTUser Swaps in SPC and gets expected ETH Out", async () => {
      //   const inETH = parseEther("0.2"), inSPC = parseToken("1");
        
      //   await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

      //   // const expectedETHLeft = parseEther("0.0004");
      //   // const expectedETHReceived = inETH.sub(expectedETHLeft);
      //   await spaceCoin.connect(alice).approve(router.address, ONE_SPC.div(10));

      //   await expect(router.connect(alice).swapSPCForETH(alice.address, ONE_SPC.div(10), 0))
      //     .to.be.revertedWith("hello there")

      //   // await assertBalances(expectedETHLeft, parseToken("1.01"), alice.address, ZERO, parseToken("0.02"));

      // });


      it("Prevents user from claiming more SPC than they have approved router for", async () => {
        const inETH = parseEther("0.04"), inSPC = parseToken("0.01");
        
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        const expectedETHLeft = parseEther("0.0004");
        const expectedETHReceived = inETH.sub(expectedETHLeft);
        await spaceCoin.connect(alice).approve(router.address, ONE_SPC.div(2));

        await expect(router.connect(alice).swapSPCForETH(alice.address, ONE_SPC, expectedETHReceived))
        .to.be.revertedWith("ERC20: insufficient allowance");
      });


      it("Prevents User From Swapping when Pool has Zero Liquidity (repeat)", async () => {
        await expect(router.connect(alice).swapETHForSPC(alice.address, 0))
          .to.be.revertedWith("ZERO_LIQUIDITY");
      });

      it("User Swaps in SPC and gets expected ETH Out", async () => {
        const inETH = parseEther("0.04"), inSPC = parseToken("0.01");
        
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        const expectedETHLeft = parseEther("0.0004");
        const expectedETHReceived = inETH.sub(expectedETHLeft);
        await spaceCoin.connect(alice).approve(router.address, ONE_SPC);

        await expect(router.connect(alice).swapSPCForETH(alice.address, ONE_SPC, expectedETHReceived))
          .to.emit(pool, "Swap")
          .withArgs(router.address, alice.address, 0, ONE_SPC, expectedETHReceived, 0);

        await assertBalances(expectedETHLeft, parseToken("1.01"), alice.address, ZERO, parseToken("0.02"));

      });

      // it("User swaps in 0 SPC but there's a donation so there's expected ETH Out", async () => {

      // });

      it("Reverts when User Swaps in SPC but ETH Out < minimum", async () => {
        const inETH = parseEther("0.04"), inSPC = parseToken("0.01");
        
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        const expectedETHLeft = parseEther("0.0004");
        const expectedETHReceived = inETH.sub(expectedETHLeft);
        await spaceCoin.connect(alice).approve(router.address, ONE_SPC);

        await expect(router.connect(alice).swapSPCForETH(alice.address, ONE_SPC, expectedETHReceived.add(1)))
          .to.be.revertedWith("SWAP_MORE_SPC")
      });

      it("User Swaps in SPC after someone donates SPC to pool and gets surplus ETH Out", async () => {
        const inETH = parseEther("0.04"), inSPC = parseToken("0.01");
        
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        // mallory donates to pool
        await spaceCoin.connect(mallory).transfer(pool.address, parseToken("0.99"));

        const expectedETHLeft = parseEther("0.0004");
        const expectedETHReceived = inETH.sub(expectedETHLeft);
        await spaceCoin.connect(alice).approve(router.address, parseToken("0.01"));

        await expect(router.connect(alice).swapSPCForETH(alice.address, parseToken("0.01"), expectedETHReceived))
          .to.emit(pool, "Swap")
          .withArgs(router.address, alice.address, 0, ONE_SPC, expectedETHReceived, 0);

        await assertBalances(expectedETHLeft, parseToken("1.01"), alice.address, ZERO, parseToken("0.02"));
      });

      // user does not get any extra, but LPs do!
      it("User Swaps in SPC after someone donates ETH to pool and gets expected ETH Out", async () => {
        const inETH = parseEther("0.04"), inSPC = parseToken("0.01");
        
        await addLiquidity(bob, inETH, inSPC, inETH, inSPC);

        // mallory donates to pool
        await pool.sendETH({value: ONE_ETHER});

        const expectedETHLeft = parseEther("0.0004");
        const expectedETHReceived = inETH.sub(expectedETHLeft);
        await spaceCoin.connect(alice).approve(router.address, ONE_SPC);

        await expect(router.connect(alice).swapSPCForETH(alice.address, ONE_SPC, expectedETHReceived))
          .to.emit(pool, "Swap")
          .withArgs(router.address, alice.address, 0, ONE_SPC, expectedETHReceived, 0);

        await assertBalances(expectedETHLeft.add(ONE_ETHER), parseToken("1.01"), alice.address, ZERO, parseToken("0.02"));
      });

    });

  });

});

  describe("ETHSPCPool", () => {
    describe("Minting LP Tokens", () => {

      it("First deposit will mint geometric mean amount of LP tokens", async () => {
        await deposit(treasury, ONE_ETHER, ONE_SPC.mul(4));
  
        await expect(pool.connect(treasury).mint(treasury.address))
          .to.emit(pool, "Mint")
          .withArgs(treasury.address, treasury.address, ONE_ETHER, ONE_SPC.mul(4), ONE_LPT.mul(2).sub(MIN_LIQ));
  
        await assertBalances(ONE_ETHER, ONE_SPC.mul(4), treasury.address, ONE_LPT.mul(2).sub(MIN_LIQ), ONE_LPT.mul(2));
      });
      
      it("Deposit even ratio into pool will mint correct LP Tokens", async () => {
        // first deposit
        await deposit(treasury, ONE_ETHER, ONE_SPC.mul(4));
        await pool.connect(treasury).mint(treasury.address);
        // second deposit
        await deposit(alice, ONE_ETHER, ONE_SPC.mul(4));
        await expect(pool.connect(alice).mint(alice.address))
          .to.emit(pool, "Mint")
          .withArgs(alice.address, alice.address, ONE_ETHER, ONE_SPC.mul(4), ONE_LPT.mul(2));
  
        // deposit/totalSupply*numLPTokensinExistence
        await assertBalances(ONE_ETHER.mul(2), ONE_SPC.mul(8), alice.address, ONE_LPT.mul(2), ONE_LPT.mul(4));
      });
  
      it("Deposit only SPC into pool will revert ", async () => {
        // first deposit 
        await deposit(treasury, ONE_ETHER, ONE_SPC.mul(4));
        await pool.connect(treasury).mint(treasury.address);
  
        await deposit(alice, ZERO, ONE_SPC.mul(4));
        await expect(pool.connect(alice).mint(alice.address))
          .to.be.revertedWith("ZERO_DEPOSITED");
      });
  
      it("Deposit only ETH into pool will revert", async () => {
         // first deposit 
         await deposit(treasury, ONE_ETHER, ONE_SPC.mul(4));
         await pool.connect(treasury).mint(treasury.address);
   
         await deposit(alice, ONE_ETHER, ZERO);
         await expect(pool.connect(alice).mint(alice.address))
          .to.be.revertedWith("ZERO_DEPOSITED");
      });
  
      it("Deposit uneven ratio will mint minimum amount of LP tokens", async () => {
         // first deposit 
         await deposit(treasury, ONE_ETHER, ONE_SPC.mul(4));
         await pool.connect(treasury).mint(treasury.address);
  
         // deposit values SPC too much
         await deposit(alice, ONE_ETHER.mul(8), ONE_SPC.mul(2));
         await pool.connect(alice).mint(alice.address);
  
         // alice should only receive 1 LPT because the SPC was the lesser of the two
         await assertBalances(ONE_ETHER.mul(9), ONE_SPC.mul(6), alice.address, ONE_LPT, ONE_LPT.mul(3));
      });
  
      it("Not depositing anything will cause a revert", async () => {
        await expect(pool.connect(treasury).mint(treasury.address))
          .to.be.revertedWith("ZERO_DEPOSITED");
      });
  
      it("Initial LPT awarded less than MIN_LPT amount will revert", async () => {
         // first deposit 
         await deposit(treasury, BigNumber.from(999), BigNumber.from(999));
         await expect(pool.connect(treasury).mint(treasury.address))
          .to.be.revertedWith("MINT_AMOUNT_SMALL");
      });
  
      it("Initial LPT awarded equal to MIN_LPT amount will revert", async () => {
        // first deposit 
        await deposit(treasury, BigNumber.from(1_000), BigNumber.from(1_000));
        await expect(pool.connect(treasury).mint(treasury.address))
         .to.be.revertedWith("MINT_AMOUNT_SMALL");
     });
    });
  
    describe("Burning LP Tokens", () => {
  
      beforeEach(async () => {
        await deposit(treasury, ONE_ETHER, ONE_SPC.mul(4));
        await pool.connect(treasury).mint(treasury.address);
        await assertBalances(ONE_ETHER, ONE_SPC.mul(4), treasury.address, ONE_LPT.mul(2).sub(MIN_LIQ), ONE_LPT.mul(2));
      })

      it("Tax on, user will receive less SPC tokens back", async () => {
        await deposit(alice, ONE_ETHER, ONE_SPC.mul(4));
        await pool.connect(alice).mint(alice.address);

        await assertBalances(ONE_ETHER.mul(2), ONE_SPC.mul(8), alice.address, ONE_LPT.mul(2), ONE_LPT.mul(4));

        await spaceCoinICO.setTax(true);
        await pool.connect(alice).transfer(pool.address, ONE_LPT.mul(2));

        await expect(pool.connect(alice).burn(alice.address))
          .to.emit(pool, "Burn")
          .withArgs(alice.address, alice.address, ONE_LPT.mul(2), ONE_ETHER, parseToken("3.92"));
      });

      it("Tax on, treasury receives same amount of SPC tokens back", async () => {
        await spaceCoinICO.setTax(true);
        await pool.connect(treasury).transfer(pool.address, ONE_LPT);
  
        // 1 ether and 4 spc
        await expect(pool.connect(treasury).burn(treasury.address))
          .to.emit(pool, "Burn")
          .withArgs(treasury.address, treasury.address, ONE_LPT, ONE_ETHER.div(2), ONE_SPC.mul(2))
        
        expect(await pool.balanceETH()).to.equal(ONE_ETHER.div(2));
        expect(await pool.balanceSPC()).to.equal(ONE_SPC.mul(2));
  
        expect(await waffle.provider.getBalance(pool.address)).to.equal(ONE_ETHER.div(2));
        expect(await spaceCoin.balanceOf(pool.address)).to.equal(ONE_SPC.mul(2));

        // TODO: assert supply of LPT
        expect(await pool.totalSupply()).to.equal(ONE_LPT);
        expect(await pool.balanceOf(treasury.address)).to.equal(ONE_LPT.sub(MIN_LIQ));

      });
  
      it("Not depositing LP tokens will cause a revert", async () => {
        await expect(pool.burn(treasury.address))
          .to.be.revertedWith("NOTHING_TO_BURN");
      });
  
      it("Initial provider depositing LP tokens returns expected ETH/SPC", async () => {  
        // transfer ONE LPT from treasury to pool
        // console.log('treasury LPT', await pool.balanceOf(treasury.address));
        await pool.connect(treasury).transfer(pool.address, ONE_LPT);
  
        // 1 ether and 4 spc
        await expect(pool.connect(treasury).burn(treasury.address))
          .to.emit(pool, "Burn")
          .withArgs(treasury.address, treasury.address, ONE_LPT, ONE_ETHER.div(2), ONE_SPC.mul(2))
        
        expect(await pool.balanceETH()).to.equal(ONE_ETHER.div(2));
        expect(await pool.balanceSPC()).to.equal(ONE_SPC.mul(2));
  
        expect(await waffle.provider.getBalance(pool.address)).to.equal(ONE_ETHER.div(2));
        expect(await spaceCoin.balanceOf(pool.address)).to.equal(ONE_SPC.mul(2));

        // TODO: assert supply of LPT
        expect(await pool.totalSupply()).to.equal(ONE_LPT);
        expect(await pool.balanceOf(treasury.address)).to.equal(ONE_LPT.sub(MIN_LIQ));
      });
  
      it("Subsequent provider depositing LP tokens returns expected ETH/SPC", async () => {
        // alice gets 2 LPT tokens as well
        await deposit(alice, ONE_ETHER, ONE_SPC.mul(4));
        await pool.connect(alice).mint(alice.address);

        expect(await pool.totalSupply()).to.equal(ONE_LPT.mul(4));
        expect(await pool.balanceOf(alice.address)).to.equal(ONE_LPT.mul(2));
  
        // alice transfers back 2 LPT tokens to pool for burning
        await pool.connect(alice).transfer(pool.address, ONE_LPT.mul(2));
  
        expect(await pool.balanceETH()).to.equal(ONE_ETHER.mul(2));
        expect(await pool.balanceSPC()).to.equal(ONE_SPC.mul(8)); 
  
        await expect(pool.connect(alice).burn(alice.address))
          .to.emit(pool, "Burn")
          .withArgs(alice.address, alice.address, ONE_LPT.mul(2), ONE_ETHER, ONE_SPC.mul(4));
        
        expect(await pool.balanceETH()).to.equal(ONE_ETHER);
        expect(await pool.balanceSPC()).to.equal(ONE_SPC.mul(4)); 
  
        expect(await waffle.provider.getBalance(pool.address)).to.equal(ONE_ETHER);
        expect(await spaceCoin.balanceOf(pool.address)).to.equal(ONE_SPC.mul(4));

        // TODO: assert total supply of pool
        expect(await pool.totalSupply()).to.equal(ONE_LPT.mul(2));
        expect(await pool.balanceOf(alice.address)).to.equal(ZERO);
  
      });
    });
//
 
describe("Swap ETH/SPC", () => {

  const initPool = async (eth: BigNumber, spc: BigNumber) => {
    // const eth = ethLess ? parseEther("0.01") : parseEther("0.04");
    // const spc = ethLess ? parseToken("0.04") : parseToken("0.01");
    
    await deposit(treasury, eth, spc);
    await pool.connect(treasury).mint(treasury.address);
  }

  // beforeEach(async () => {
  //   await deposit(treasury, parseEther("0.01"), parseToken("0.04"));
  //   await pool.connect(treasury).mint(treasury.address);
  //   await assertBalances(parseEther("0.01"), parseToken("0.04"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));
  // });

  // it("Space Tax and trader deposits SPC => ETH out is less", async () => {

  // });

  describe("ETH => SPC", () => {
    // it("Space Tax on and trader deposits ETH => SPC out is less", async () => {
    //   await initPool(parseEther("0.01"), parseToken("0.04"));
    //   await assertBalances(parseEther("0.01"), parseToken("0.04"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

    //   const depositAmount = ONE_ETHER;
      
    //   await deposit(alice, depositAmount, ZERO);




    // });

    it("Trader deposits some ETH and 0 SPC => gets SPC out", async () => {
      await initPool(parseEther("0.01"), parseToken("0.04"));
      await assertBalances(parseEther("0.01"), parseToken("0.04"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

      const depositAmount = ONE_ETHER;
      
      await deposit(alice, depositAmount, ZERO);

      // double check alice has 10 spacecoin since she deposited 2 eth before
      expect(await spaceCoin.balanceOf(alice.address)).to.equal(ONE_SPC.mul(10));

      const prevETHBalance = parseEther("0.01");
      const prevSPCBalance = parseToken("0.04");

      expect(await pool.balanceETH()).to.equal(prevETHBalance);
      expect(await pool.balanceSPC()).to.equal(prevSPCBalance);

      const newSPCBalance = parseToken("0.0004")
      await expect(pool.connect(alice).swapETHtoSPC(alice.address))
        .to.emit(pool, "Swap")
        // executor, to, eth in, spc in, eth out, spc out
        .withArgs(alice.address, alice.address, depositAmount, 0, 0, prevSPCBalance.sub(newSPCBalance));
      
      expect(await pool.balanceETH()).to.equal(prevETHBalance.add(depositAmount));
      expect(await pool.balanceSPC()).to.equal(newSPCBalance);
    });

    it("Prevents trader getting SPC out with no deposit of ETH", async () => {
      await initPool(parseEther("0.01"), parseToken("0.04"));
      await assertBalances(parseEther("0.01"), parseToken("0.04"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

      await expect(pool.connect(alice).swapETHtoSPC(alice.address))
        .to.be.revertedWith("ZERO_DEPOSITED");
    })

    it("Prevents trader getting SPC out by only depositing SPC", async () => {
      await initPool(parseEther("0.01"), parseToken("0.04"));
      await assertBalances(parseEther("0.01"), parseToken("0.04"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));
      
      await deposit(alice, ZERO, ONE_SPC);

      await expect(pool.connect(alice).swapETHtoSPC(alice.address))
        .to.be.revertedWith("ZERO_DEPOSITED");
    });

    it("Trader swaps before there is any liquidity", async () => {
      const depositAmount = ONE_ETHER;
          
      await deposit(alice, depositAmount, ZERO);

      await expect(pool.connect(alice).swapETHtoSPC(alice.address))
        .to.be.revertedWith("ZERO_LIQUIDITY");
    });

    it("Trader swaps ETH for SPC while there is unaccounted SPC in pool", async () => {
      await initPool(parseEther("0.01"), parseToken("0.04"));
      await assertBalances(parseEther("0.01"), parseToken("0.04"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

      // alice attacker transfers 5 SPC
      await deposit(alice, ZERO, ONE_SPC.mul(4));

      // bob deposits 1 ETH
      await deposit(bob, ONE_ETHER, ZERO);

      // stuff
      expect(await spaceCoin.balanceOf(alice.address)).to.equal(ONE_SPC.mul(6));

      const prevOfficialETHBalance = parseEther("0.01");
      const prevOfficialSPCBalance = parseToken("0.04");

      const prevActualETHBalance = prevOfficialETHBalance;
      const prevActualSPCBalance = parseToken("4.04");

      expect(await pool.balanceETH()).to.equal(prevOfficialETHBalance);
      expect(await pool.balanceSPC()).to.equal(prevOfficialSPCBalance);

      const expectedSPCOut =  prevOfficialSPCBalance.sub(parseToken("0.0004"));
      await expect(pool.connect(alice).swapETHtoSPC(alice.address))
        .to.emit(pool, "Swap")
        // executor, to, eth in, spc in, eth out, spc out
        .withArgs(alice.address, alice.address, ONE_ETHER, 0, 0, expectedSPCOut);
      
      // balances are in sync even with extra spc. it's dispersed to all LPS
      expect(await pool.balanceETH()).to.equal(prevActualETHBalance.add(ONE_ETHER));
      expect(await pool.balanceSPC()).to.equal(prevActualSPCBalance.sub(expectedSPCOut));

      expect(await waffle.provider.getBalance(pool.address)).to.equal(prevActualETHBalance.add(ONE_ETHER));
      expect(await spaceCoin.balanceOf(pool.address)).to.equal(prevActualSPCBalance.sub(expectedSPCOut));
    });

  });

  describe("SPC => ETH", () => {

  it("Trader deposits 0 ETH and some SPC => gets ETH out", async () => {
    await initPool(parseEther("0.04"), parseToken("0.01"));
    await assertBalances(parseEther("0.04"), parseToken("0.01"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));
    
    const depositAmount = ONE_SPC;
    
    await deposit(alice, ZERO, depositAmount);

    // double check alice has 10 spacecoin since she deposited 2 eth before
    expect(await spaceCoin.balanceOf(alice.address)).to.equal(ONE_SPC.mul(9));

    const prevETHBalance = parseEther("0.04");
    const prevSPCBalance = parseToken("0.01");

    expect(await pool.balanceETH()).to.equal(prevETHBalance);
    expect(await pool.balanceSPC()).to.equal(prevSPCBalance);

    const newETHBalance = parseToken("0.0004");
    await expect(pool.connect(alice).swapSPCtoETH(alice.address))
      .to.emit(pool, "Swap")
      // executor, to, eth in, spc in, eth out, spc out
      .withArgs(alice.address, alice.address, 0, depositAmount, prevETHBalance.sub(newETHBalance), 0);
    
    expect(await pool.balanceETH()).to.equal(newETHBalance);
    expect(await pool.balanceSPC()).to.equal(prevSPCBalance.add(depositAmount));
  });

  it("Prevents trader getting ETH out with no deposit of SPC", async () => {
    await initPool(parseEther("0.01"), parseToken("0.04"));
    await assertBalances(parseEther("0.01"), parseToken("0.04"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

    await expect(pool.connect(alice).swapSPCtoETH(alice.address))
      .to.be.revertedWith("ZERO_DEPOSITED");
  })

  it("Prevents trader getting ETH out by only depositing ETH", async () => {
    await initPool(parseEther("0.01"), parseToken("0.04"));
    await assertBalances(parseEther("0.01"), parseToken("0.04"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));
    
    await deposit(alice, ONE_ETHER, ZERO);

    await expect(pool.connect(alice).swapSPCtoETH(alice.address))
      .to.be.revertedWith("ZERO_DEPOSITED");
  });

  it("Trader swaps before there is any liquidity", async () => {
    const depositAmount = ONE_ETHER;
        
    await deposit(alice, depositAmount, ZERO);

    await expect(pool.connect(alice).swapSPCtoETH(alice.address))
      .to.be.revertedWith("ZERO_LIQUIDITY");
  });


  it("Trader swaps SPC for ETH while there is unaccounted ETH in pool", async () => {
    await initPool(parseEther("0.04"), parseToken("0.01"));
    await assertBalances(parseEther("0.04"), parseToken("0.01"), treasury.address, parseToken("0.02").sub(MIN_LIQ), parseToken("0.02"));

    // bob is attacker and transfers 4 ETH
    await deposit(bob, ONE_ETHER.mul(4), ZERO);

    // alice deposits 1 SPC
    await deposit(alice, ZERO, ONE_SPC);

    // stuff
    expect(await spaceCoin.balanceOf(alice.address)).to.equal(ONE_SPC.mul(9));

    const prevOfficialETHBalance = parseEther("0.04");
    const prevOfficialSPCBalance = parseToken("0.01");

    const prevActualETHBalance = parseEther("4.04");
    const prevActualSPCBalance = prevOfficialSPCBalance;

    expect(await pool.balanceETH()).to.equal(prevOfficialETHBalance);
    expect(await pool.balanceSPC()).to.equal(prevOfficialSPCBalance);

    const expectedETHOut =  prevOfficialETHBalance.sub(parseToken("0.0004"));
    await expect(pool.connect(alice).swapSPCtoETH(alice.address))
      .to.emit(pool, "Swap")
      // executor, to, eth in, spc in, eth out, spc out
      .withArgs(alice.address, alice.address, 0, ONE_ETHER, expectedETHOut, 0);
    
    expect(await pool.balanceETH()).to.equal(prevActualETHBalance.sub(expectedETHOut));
    expect(await pool.balanceSPC()).to.equal(prevActualSPCBalance.add(ONE_SPC));

    expect(await waffle.provider.getBalance(pool.address)).to.equal(prevActualETHBalance.sub(expectedETHOut));
    expect(await spaceCoin.balanceOf(pool.address)).to.equal(prevActualSPCBalance.add(ONE_SPC));
  });

  });


});  

  });
  
 
});