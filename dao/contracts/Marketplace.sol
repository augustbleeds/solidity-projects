//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "hardhat/console.sol";

interface NftMarketplace {
    function getPrice(address nftContract, uint256 nftId) external returns (uint price);
    function buy(address nftContract, uint256 nftId) external payable returns (bool success);
}


contract GoodMarketplace is NftMarketplace {
  function getPrice(address nftContract, uint256 nftId) external override returns (uint price) {
    return nftId;
  }

  function buy(address nftContract, uint256 nftId) external payable override returns (bool success) {
    if(nftId == 1) {
      return true;
    }
    if(nftId == 100){
      revert("Mimic some Error");
    }
    return false;
  }
}


contract BadMarketplace {
  function doesNothing(uint256 number) external pure returns (uint256){
    return number;
  }
}