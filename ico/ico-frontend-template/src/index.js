import { ethers } from "ethers"
import IcoJSON from '../../artifacts/contracts/SpaceCoinICO.sol/SpaceCoinICO.json';
import SpaceCoinJSON from '../../artifacts/contracts/SpaceCoin.sol/SpaceCoin.json';

const provider = new ethers.providers.Web3Provider(window.ethereum);
let signer = provider.getSigner();

const icoAddr = '0x6dC6048a47e327687647c0Deb23B90EC0C1fEf99';
const icoContract = new ethers.Contract(icoAddr, IcoJSON.abi, provider);

// const spaceCoinAddr = '0x59220Fe076A7C5b861730EbFcE434818d7b27BeA';
// const spaceCoinContract = new ethers.Contract(spaceCoinAddr, SpaceCoinJSON.abi, provider);
const SPC_FUND_GOAL = 150_000;

window.ethereum.on('accountsChanged', async function(accounts) {
  console.log('account changed');
  signer = provider.getSigner();
  await connectToMetamask();
  await updateTotalSupplyLeft();
  await updatePurchased();
  buy_message.innerText = "";
})

async function connectToMetamask() {
  try {
    console.log("Signed in as", await signer.getAddress())
  }
  catch(err) {
    console.log("Not signed in")
    await provider.send("eth_requestAccounts", [])
  }
}

ico_spc_buy.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const eth = ethers.utils.parseEther(form.eth.value);
  console.log("Buying", eth, "eth")

  await connectToMetamask()

  try {
    const tx = await icoContract.connect(signer).contribute({value: eth});
    await tx.wait();
    buy_message.innerText = "Success";
    buy_message.style.color = "green";
  } catch (error) {
    if(typeof error === "string") {
      buy_message.innerText = "BUY FAILED...." + error;
      buy_error_message.style.color = "red"
    } else {
      window.xyz = error;
      buy_message.innerText = error.message;
      buy_message.style.color = "red"
    }

  }
  await updateTotalSupplyLeft()
  await updatePurchased()

})

// todo: add total # of tokens user has purchased thus far

async function updateTotalSupplyLeft() {
  try {
    const spcRaised = (await icoContract.fundMax() * 5) / (1e18); 
    const totalSupplyLeft = SPC_FUND_GOAL - spcRaised;
    ico_spc_left.innerText = totalSupplyLeft; 
    left_message = "";
  } catch (error) {
    left_message.innerText = "Could Not Retrieve Remaining SPC left to purchase";
    left_message.style.color = "red";
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
