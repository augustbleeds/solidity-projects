//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./SpaceCoin.sol";
import "./Math.sol";

contract ETHSPCPool is ERC20 {
    uint256 public balanceSPC;
    uint256 public balanceETH;

    uint256 constant public MIN_LPT = 1000;

    SpaceCoin public spaceCoin;

    bool public lock;

    constructor(address _spaceCoin) ERC20("LiquidityPoolTokens", "LPT") {
        spaceCoin = SpaceCoin(_spaceCoin);
    }

    event Mint(
        address executor,
        address to,
        uint256 depositedETH,
        uint256 depositedSPC,
        uint256 receivedLPT
    );

    event Burn(
        address executor,
        address to,
        uint256 burnedLPT,
        uint256 receivedETH,
        uint256 receivedSPC
    );

    event Swap(
        address executor,
        address to,
        uint256 swapInETH,
        uint256 swapInSPC,
        uint256 swapOutETH,
        uint256 swapOutSPC
    );

    modifier withLock() {
        require(lock == false, "REENTRANCY_DENIED");
        lock = true;
        _;
        lock = false;
    }

    /* @notice Anyone can call this function (executor) and they send lp tokens to "to" person
     * Assumes that ETH or SPC has been deposited to the pool
     * It keeps balance and reserve to know how much was added
     */
    function mint(address to) external withLock returns(uint256 rewardLPT) {
        uint256 currentETH = address(this).balance;
        uint256 currentSPC = spaceCoin.balanceOf(address(this));

        // both should be positive
        uint256 depositedETH = currentETH - balanceETH;
        uint256 depositedSPC = currentSPC - balanceSPC;
        uint256 totalLPT = totalSupply();

        // if either is 0, initial deposit would make the other token valued at infinite amount -- guard protects this
        if (depositedETH == 0 || depositedSPC == 0) {
            revert("ZERO_DEPOSITED");
        }

        rewardLPT;
        if (totalLPT == 0) {
            uint256 nonAdjustedLPT = Math.sqrt(depositedETH * depositedSPC);
            require(nonAdjustedLPT > MIN_LPT, "MINT_AMOUNT_SMALL");
            rewardLPT = nonAdjustedLPT - MIN_LPT;
            // burn address
            _mint(address(7), MIN_LPT);
        } else {
            rewardLPT = Math.min(
                (totalLPT * depositedETH) / balanceETH,
                (totalLPT * depositedSPC) / balanceSPC
            );
        }

        require(rewardLPT > 0, "MINT_AMOUNT_ZERO");

        _mint(to, rewardLPT);

        // i don't think this will ever occur if you can only add
        require(
            currentETH * currentSPC >= balanceETH * balanceSPC,
            "K_VALUE_LOW"
        );

        // update balance to reflect amount
        balanceETH = currentETH;
        balanceSPC = currentSPC;

        emit Mint(msg.sender, to, depositedETH, depositedSPC, rewardLPT);
    }

    /// @notice assumes that LP tokens have been transferred back to pool
    function burn(address to) external withLock returns(uint256 receivedETH, uint256 receivedSPC){
        // burnLPT is how much the user wants to burn/trade in because they transferred it to pool's ownership already
        uint256 burnLPT = balanceOf(address(this));
        require(burnLPT > 0, "NOTHING_TO_BURN");

        uint256 totalLPT = totalSupply();

        uint256 currentETH = address(this).balance;
        uint256 currentSPC = spaceCoin.balanceOf(address(this));

        // we'll never have divide by zero errors
        receivedETH = (burnLPT * currentETH) / totalLPT;
        receivedSPC = (burnLPT * currentSPC) / totalLPT;

        _burn(address(this), burnLPT);

        // send ETH
        (bool success, ) = to.call{value: receivedETH}("");
        require(success, "CANT_SEND_ETH");

        // send SPC
        spaceCoin.transfer(to, receivedSPC);

        // update balances
        balanceETH = currentETH - receivedETH;
        balanceSPC = currentSPC - receivedSPC;

        // adjust actual received for event emittance
        if(spaceCoin.taxEffective() && to != spaceCoin.treasury()) {
            receivedSPC = receivedSPC * 49 / 50;
        }

        emit Burn(msg.sender, to, burnLPT, receivedETH, receivedSPC);
    }

    function swapSPCtoETH(address to) external withLock {
        uint256 currentSPC = spaceCoin.balanceOf(address(this));

        require(balanceETH > 0 && balanceSPC > 0, "ZERO_LIQUIDITY");

        // both should be greater than or equal to 0
        uint256 depositedSPC = currentSPC - balanceSPC;

        require(depositedSPC > 0, "ZERO_DEPOSITED");

        uint256 withdrawETH;

        {
            uint256 newETHBalance = (balanceSPC * balanceETH) /
                (((99 * depositedSPC) / 100) + balanceSPC);
            withdrawETH = balanceETH - newETHBalance;
        }

        require(withdrawETH < balanceETH, "NOT_ENOUGH_LIQUIDITY");

        require(withdrawETH > 0, "ZERO_SWAP");

        (bool success, ) = to.call{value: withdrawETH}("");
        require(success, "CANT_SEND_ETH");

        uint256 currentETH = address(this).balance;

        require(
            currentETH * currentSPC >= balanceETH * balanceSPC,
            "K_VALUE_LOW"
        );

        balanceETH = currentETH;
        balanceSPC = currentSPC;

        emit Swap(msg.sender, to, 0, depositedSPC, withdrawETH, 0);
    }

    // note someone can add SPC to the pool -- but we use the official SPC values
    function swapETHtoSPC(address to) external withLock {
        uint256 currentETH = address(this).balance;

        require(balanceETH > 0 && balanceSPC > 0, "ZERO_LIQUIDITY");

        // both should be greater than or equal to 0
        uint256 depositedETH = currentETH - balanceETH;

        require(depositedETH > 0, "ZERO_DEPOSITED");

        uint256 withdrawSPC;

        {
            uint256 newSPCBalance = (balanceETH * balanceSPC) /
                (((99 * depositedETH) / 100) + balanceETH);
            withdrawSPC = balanceSPC - newSPCBalance;
        }

        // note that we use "official" spc , not actual balance
        require(withdrawSPC < balanceSPC, "NOT_ENOUGH_LIQUIDITY");

        require(withdrawSPC > 0, "ZERO_SWAP");

        spaceCoin.transfer(to, withdrawSPC);

        uint256 currentSPC = spaceCoin.balanceOf(address(this));

        require(
            currentETH * currentSPC >= balanceETH * balanceSPC,
            "K_VALUE_LOW"
        );

        balanceETH = currentETH;
        balanceSPC = currentSPC;

        if(spaceCoin.taxEffective() && msg.sender != spaceCoin.treasury()) {
            withdrawSPC = withdrawSPC * 49 / 50;
        }

        emit Swap(msg.sender, to, depositedETH, 0, 0, withdrawSPC);
    }

    function sendETH() external payable withLock {}

}
