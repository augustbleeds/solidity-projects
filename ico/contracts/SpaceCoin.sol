//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SpaceCoin is ERC20 {

  uint256 constant private ONE_TOKEN = 10 ** 18; 

  address public owner;     // owner is also the ICO Contract
  address public treasury;
  bool public taxEffective;

  constructor(address _treasury) ERC20("SpaceCoin", "SPC") {
    treasury = _treasury;
    owner = msg.sender;
    _init_coins();
  }

  function _init_coins() private {
    _mint(owner, 150_000 * ONE_TOKEN);
    _mint(treasury, 350_000 * ONE_TOKEN);
  }

  function setTax(bool tax) external returns(bool) {
    if(tax != taxEffective) {
      taxEffective = tax;
    }
    return taxEffective;
    
  }

  function _transfer(address from, address to, uint256 amount) internal override {
    if(taxEffective && to != treasury) {
      // rounds down to if amount is not divisible by 50
      uint256 taxAmount = (amount) / 50;
      uint256 remainingAmount = amount - taxAmount;
      super._transfer(from, treasury, taxAmount);
      super._transfer(from, to, remainingAmount);
    } else {
      super._transfer(from, to, amount);
    }
  }

}