import { ethers } from "hardhat";

async function main() {

  const [treasury] = await ethers.getSigners();

  // We get the contract to deploy
  const SpaceCoinICO = await ethers.getContractFactory("SpaceCoinICO");
  const spaceCoinICO = await SpaceCoinICO.deploy(treasury.address);

  await spaceCoinICO.deployed();

  const spaceCoinAddress = await spaceCoinICO.spaceCoin()

  console.log("spaceCoinICO deployed to: ", spaceCoinICO.address);
  console.log("spaceCoin deployed to: ", spaceCoinAddress);

  // general phase
  const tx = await spaceCoinICO.advance(0);
  await tx.wait();

  // open phase
  const tx2 = await spaceCoinICO.advance(1);
  await tx2.wait();

  // now, anyone can invest!

  // deploy the pool
  const Pool = await ethers.getContractFactory("ETHSPCPool");
  const pool = await Pool.deploy(spaceCoinAddress);
  await pool.deployed();

  // deploy the router
  const Router = await ethers.getContractFactory("SpaceRouter");
  const router = await Router.deploy(spaceCoinAddress, pool.address);
  await router.deployed();

  console.log("pool deployed to: ", pool.address);
  console.log("router deployed to: ", router.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
