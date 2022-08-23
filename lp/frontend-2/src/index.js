import { ethers } from "ethers";
import SpaceRouterJSON from '../../artifacts/contracts/SpaceRouter.sol/SpaceRouter.json';
import SpaceCoinJSON from '../../artifacts/contracts/SpaceCoin.sol/SpaceCoin.json';
import PoolJSON from '../../artifacts/contracts/ETHSPCPool.sol/ETHSPCPool.json';
import IcoJSON from '../../artifacts/contracts/SpaceCoinICO.sol/SpaceCoinICO.json';
import { BigNumber } from "ethers";

// spaceCoinICO deployed to:  0xd412844eE6686aF223cd6581934A50C276f7AB5A
// spaceCoin deployed to:  0x5A19711FF0cB7f1588a42602817De2B9a3c6B7F9
// pool deployed to:  0xB0174d0b5770CCd494F158d64AED48a4B880e295
// router deployed to:  0xe9F5dAA7cF6Ff9cbeDC07D94111CA640fdf4d58F


const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();

const spaceCoinAddr = '0x5A19711FF0cB7f1588a42602817De2B9a3c6B7F9';
const spaceCoin = new ethers.Contract(spaceCoinAddr, SpaceCoinJSON.abi, provider);

const routerAddr = '0xe9F5dAA7cF6Ff9cbeDC07D94111CA640fdf4d58F';
const router = new ethers.Contract(routerAddr, SpaceRouterJSON.abi, provider);

const poolAddr = '0xB0174d0b5770CCd494F158d64AED48a4B880e295';
const pool = new ethers.Contract(poolAddr, PoolJSON.abi, provider);

const icoAddr = '0xd412844eE6686aF223cd6581934A50C276f7AB5A';
const icoContract = new ethers.Contract(icoAddr, IcoJSON.abi, provider);

const SPC_FUND_GOAL = 150_000;


async function connectToMetamask() {
  try {
    console.log("Signed in as", await signer.getAddress())
  }
  catch(err) {
    console.log("Not signed in")
    await provider.send("eth_requestAccounts", [])
  }
}

//
// ICO
//
ico_spc_buy.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const eth = ethers.utils.parseEther(form.eth.value)
  console.log("Buying", eth, "eth")

  await connectToMetamask()
  // TODO: Call ico contract contribute function
  
  try {
    const tx = await icoContract.connect(signer).contribute({value: eth});
    await tx.wait();
    buy_message.innerText = "Success";
    buy_message.style.color = "green";
  } catch (error) {
    if(typeof error === "string") {
      buy_message.innerText = "BUY FAILED...." + error;
      buy_message.style.color = "red"
    } else {
      buy_message.innerText = error.message;
      buy_message.style.color = "red"
    }

  }
  await updateTotalSupplyLeft()
  await updatePurchased()
});


//
// LP
//
let currentSpcToEthPrice = 5;

provider.on("block", async n => {
  console.log("New block", n)
  const spc = await pool.balanceSPC();
  const eth = await pool.balanceETH();
  if(!(spc.isZero() && eth.isZero())) {
    currentSpcToEthPrice = spc.div(eth).toNumber();
  }
  console.log("Current Prices", spc, eth);
})

lp_deposit.eth.addEventListener('input', e => {
  lp_deposit.spc.value = +e.target.value * currentSpcToEthPrice
})

lp_deposit.spc.addEventListener('input', e => {
  lp_deposit.eth.value = +e.target.value / currentSpcToEthPrice
})

lp_deposit.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const eth = ethers.utils.parseEther(form.eth.value)
  const spc = ethers.utils.parseEther(form.spc.value)
  console.log("Depositing", eth, "eth and", spc, "spc")

  await connectToMetamask()
  // TODO: Call router contract deposit function

  const address = await signer.getAddress();
  const desiredSPC = spc;
  // default minimum will be 95% of their desired amount
  const minETH = eth.mul(19).div(20);
  const minSPC = spc.mul(19).div(20);

  try {
    await spaceCoin.connect(signer).approve(routerAddr, desiredSPC);
    await router.connect(signer).addLiquidity(address, desiredSPC, minETH, minSPC, {value: eth});
    lp_deposit_message.innerText = "Deposit successful";
    lp_deposit_message.style.color = "green";
  } catch (error) {
    lp_deposit_message.innerText = "Unable to Deposit Liquidity";
    lp_deposit_message.style.color = "red";
    console.log("Unable to Deposit Liquidity", error);
  }
});

lp_withdraw.addEventListener('submit', async e => {
  e.preventDefault()
  console.log("Withdrawing 100% of LP")

  await connectToMetamask();

  const address = await signer.getAddress();
  const liquidity = await pool.balanceOf(address);

  await pool.connect(signer).approve(routerAddr, liquidity);

  try {
    // default minimum is 0 for simplicity!
    await router.connect(signer).removeLiquidity(address, liquidity, 0, 0);
    lp_withdraw_message.innerText = "Withdraw successful";
    lp_withdraw_message.style.color = "green";
  } catch (error) {
    lp_withdraw_message.innerText = "Unable to Withdraw Liquidity";
    lp_withdraw_message.style.color = "red";
    console.log("Unable to Withdraw Liquidity", error);
  }
});

//
// Swap
//
let swapIn = { type: 'eth', value: 0 }
let swapOut = { type: 'spc', value: 0 }
switcher.addEventListener('click', () => {
  [swapIn, swapOut] = [swapOut, swapIn]
  swap_in_label.innerText = swapIn.type.toUpperCase()
  swap.amount_in.value = swapIn.value
  updateSwapOutLabel()
})

swap.amount_in.addEventListener('input', updateSwapOutLabel)

function updateSwapOutLabel() {
  swapOut.value = swapIn.type === 'eth'
    ? +swap.amount_in.value * currentSpcToEthPrice
    : +swap.amount_in.value / currentSpcToEthPrice

  swap_out_label.innerText = `${swapOut.value} ${swapOut.type.toUpperCase()}`
}

function getSwapOut(tokenAIn, tokenABalance, tokenBBalance) {
  console.log(tokenAIn, tokenABalance, tokenBBalance, 'getswapout');
  const newTokenBBalance = (tokenABalance.mul(tokenBBalance)).div(((tokenAIn.mul(99)).div(100)).add(tokenABalance));
  return tokenBBalance.sub(newTokenBBalance);
}

swap.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const amountIn = ethers.utils.parseEther(form.amount_in.value)

  await connectToMetamask();

  console.log("Swapping", amountIn, swapIn.type, "for", swapOut.type)

  const address = await signer.getAddress();

  const spc = await pool.balanceSPC();
  const eth = await pool.balanceETH();

  if(spc.isZero() && eth.isZero()) {
    swap_message.innerText = "Unable to Swap -- No Liquidity";
    swap_message.style.color = "red";
    console.log("Unable to Swap", error);
    return;
  }

  try {
    if(swapIn.type == "eth") {
      const spcOut = getSwapOut(amountIn, eth, spc);
      const minSpcOut = spcOut.mul(19).div(20);
      console.log(spcOut, amountIn, minSpcOut, 'eth swap');
      await router.connect(signer).swapETHForSPC(address, BigNumber.from("0"), {value: amountIn});
    } else {
      await spaceCoin.connect(signer).approve(routerAddr, amountIn);
      const ethOut = getSwapOut(amountIn, spc, eth);
      const minEthOut = ethOut.mul(19).div(20);
      console.log(minEthOut, amountIn, 'spc swap');
      await router.connect(signer).swapSPCForETH(address, amountIn, BigNumber.from("0"));
    }
  } catch (error) {
    swap_message.innerText = "Unable to Swap";
    swap_message.style.color = "red";
    console.log("Unable to Swap", error);
  }
});


async function updateTotalSupplyLeft() {
  try {
    const spcRaised = (await icoContract.fundMax() * 5) / (1e18); 
    const totalSupplyLeft = SPC_FUND_GOAL - spcRaised;
    ico_spc_left.innerText = totalSupplyLeft; 
    left_message = "";
  } catch (error) {
    left_message.innerText = "Could Not Retrieve Remaining SPC left to purchase";
    left_message.style.color = "red";
    console.log('supply left error', error);
  }
}

async function updatePurchased() {
  try {
    tokensPurchased = (await icoContract.purchased(await signer.getAddress())) * 5;
    purchased.innerText = tokensPurchased/1e18;
  } catch (error) {
    purchased_message.innerText = "Could not get Purchased amount";
    purchased_message.style.color = "red";
  }
}

(() => {
  updatePurchased();
  updateTotalSupplyLeft();
})();
