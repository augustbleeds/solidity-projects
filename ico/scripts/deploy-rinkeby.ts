import { ethers } from "hardhat";

async function main() {


  const [deployer, treasury] = await ethers.getSigners();

  // We get the contract to deploy
  const SpaceCoinICO = await ethers.getContractFactory("SpaceCoinICO");
  const spaceCoinICO = await SpaceCoinICO.deploy(treasury.address);

  await spaceCoinICO.deployed();

  console.log("spaceCoinICO deployed to:", spaceCoinICO.address);
  console.log("spaceCoin deployed to", await spaceCoinICO.spaceCoin());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
