//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "./SpaceCoin.sol";
import "./ETHSPCPool.sol";

contract SpaceRouter {
    SpaceCoin public spaceCoin;
    ETHSPCPool public pool;

    bool public lock;

    modifier withLock() {
        require(lock == false, "REENTRANCY_DENIED");
        lock = true;
        _;
        lock = false;
    }

    constructor(address _spaceCoin, address _pool) {
        spaceCoin = SpaceCoin(_spaceCoin);
        pool = ETHSPCPool(_pool);
    }

    function getIdealAmountIn(
        uint256 tokenAIn,
        uint256 tokenABalance,
        uint256 tokenBBalance
    ) private pure returns (uint256 tokenBIn) {
        require(tokenAIn > 0, "ZERO_DEPOSIT");
        require(tokenABalance > 0 && tokenBBalance > 0, "ZERO_LIQUIDITY");
        tokenBIn = (tokenAIn * tokenBBalance) / tokenABalance;
    }

    // Similar to uniswap -- a way to calculate the ideal liquidity based on K values!
    function _getLiquidity(
        uint256 desiredETHIn,
        uint256 desiredSPCIn,
        uint256 minETHIn,
        uint256 minSPCIn
    ) private view returns (uint256 actualETHIn, uint256 actualSPCIn) {
        uint256 balanceETH = pool.balanceETH();
        uint256 balanceSPC = pool.balanceSPC();

        if (balanceETH == 0 && balanceSPC == 0) {
            (actualETHIn, actualSPCIn) = (desiredETHIn, desiredSPCIn);
        } else {
            uint256 idealETHIn = getIdealAmountIn(
                desiredSPCIn,
                balanceSPC,
                balanceETH
            );
            if (idealETHIn <= desiredETHIn) {
                require(idealETHIn >= minETHIn, "NOT_ENOUGH_SPC_IN");
                (actualETHIn, actualSPCIn) = (idealETHIn, desiredSPCIn);
            } else {
                uint256 idealSPCIn = getIdealAmountIn(
                    desiredETHIn,
                    balanceETH,
                    balanceSPC
                );
                if (idealSPCIn <= desiredSPCIn) {
                    require(idealSPCIn >= minSPCIn, "NOT_ENOUGH_ETH_IN");
                    (actualETHIn, actualSPCIn) = (desiredETHIn, idealSPCIn);
                }
            }
        }
    }

    /* @notice This function assumes that the Router has access to transfer the tokens
     * It adds ETH and SPC together since you deposit equal amounts and rewards expect LP tokens back
     * The "desiredETH" is implicit in the amount this function received in ether
     * minETH and minSPC are based on actual values that will be in the pool
     */
    function addLiquidity(
        address to,
        uint256 desiredSPC,
        uint256 minETH,
        uint256 minSPC
    )
        external
        payable
        withLock
        returns (
            uint256 actualETHIn,
            uint256 actualSPCIn,
            uint256 liquidityReceived
        )
    {
        if(spaceCoin.taxEffective()) {
            desiredSPC = desiredSPC * 49 / 50;
        }

        // based on values that will be in the pool after the transfer
        (actualETHIn, actualSPCIn) = _getLiquidity(
            msg.value,
            desiredSPC,
            minETH,
            minSPC
        );

        require(actualETHIn > 0 && actualSPCIn > 0, "NO_LIQUIDITY_IN");

        require(actualETHIn >= minETH && actualSPCIn >= minSPC, "MINIMUM_NOT_MET");

        if(spaceCoin.taxEffective()) {
            // we need to account for the tax
            actualSPCIn = actualSPCIn * 50 / 49 ;
        }

        spaceCoin.transferFrom(msg.sender, address(pool), actualSPCIn);
        pool.sendETH{value: actualETHIn}();

        (liquidityReceived) = pool.mint(to);
        // uses spaceCoin address above
        //
    }

    /// @notice that the privelege for the router to be able to transfer tokens from sender to the pool will be required
    function removeLiquidity(
        address to,
        uint256 liquidity,
        uint256 minETH,
        uint256 minSPC
    ) external withLock {
        require(liquidity > 0, "NOTHING_TO_BURN");

        pool.transferFrom(msg.sender, address(pool), liquidity);

        (uint256 receivedETH, uint256 receivedSPC) = pool.burn(to);

        require(
            receivedETH >= minETH && receivedSPC >= minSPC,
            "SUPPLY_MORE_LIQUIDITY"
        );
    }

    function _getSwapAmount(
        uint256 tokenAIn,
        uint256 tokenABalance,
        uint256 tokenBBalance
    ) private pure returns (uint256) {
        uint256 newTokenBBalance = (tokenABalance * tokenBBalance) /
            (((99 * tokenAIn) / 100) + tokenABalance);
        return tokenBBalance - newTokenBBalance;
    }

    /// @notice minSPCOut is how you calculate slippage
    function swapETHForSPC(address to, uint256 minSPCOut)
        external
        payable
        withLock
        returns (uint256 actualSPCOut)
    {
        (uint256 balanceETH, uint256 balanceSPC) = (
            pool.balanceETH(),
            pool.balanceSPC()
        );
        // there could be something actually in the pool, but we base swap values on official values
        require(balanceETH > 0 && balanceSPC > 0, "ZERO_LIQUIDITY");

        uint256 actualAmountIn = msg.value +
            (address(pool).balance - balanceETH);

        actualSPCOut = _getSwapAmount(actualAmountIn, balanceETH, balanceSPC);

        if(spaceCoin.taxEffective() && to != spaceCoin.treasury()) {
            actualSPCOut = actualSPCOut * 49 / 50;
        }

        require(actualSPCOut >= minSPCOut, "SWAP_MORE_ETH");

        // send ETH In
        pool.sendETH{value: msg.value}();

        pool.swapETHtoSPC(to);
    }

    // @notice: depoistedSPC is subject to fees
    function swapSPCForETH(
        address to,
        uint256 depositedSPC,
        uint256 minETHOut
    ) external withLock returns (uint256 actualETHOut) {
        (uint256 balanceETH, uint256 balanceSPC) = (
            pool.balanceETH(),
            pool.balanceSPC()
        );
        // there could be something actually in the pool, but we base swap values on official values
        require(balanceETH > 0 && balanceSPC > 0, "ZERO_LIQUIDITY");

        // send spc in first
        spaceCoin.transferFrom(msg.sender, address(pool), depositedSPC);

        uint256 actualAmountIn = spaceCoin.balanceOf(address(pool)) -
            balanceSPC;

        actualETHOut = _getSwapAmount(actualAmountIn, balanceSPC, balanceETH);

        require(actualETHOut >= minETHOut, "SWAP_MORE_SPC");

        pool.swapSPCtoETH(to);
    }
}
