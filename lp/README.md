# Liquidity Pool

## TL;DR

A constant-product automated market maker inspired by Uniswapv2. It allows the swapping for ETH to SpaceCoin (the meme-coin I created earlier in another folder).

## ETHSPCPool.sol

This is the low-level liquidity pool that swaps ETH for SPC and vice-versa. There are four functions `mint`, `burn`, `swapSPCtoETH`, and `swapETHtoSPC`. Whereas uniswap supports swaps of both tokens in one transaction, I made a decision decision to only support swaps one way per transaction (hence why there are 2 swap functions instead of 1). Although we can trust the spacecoin transfers to not have re-entrancy vulnerabilities, we cannot trust the receiver's receive function whenever we send ether. Therefore, I have taken a conservative approach in that all functions are guarded by re-entrancy lock to discourage the user from calling any pool or router related function again from their receive function even if there is no vulnerability because the pool/router is not designed to be used recursively from the receiver's receive function.

### *mint* 
    function mint(address to) external withLock returns(uint256 rewardLPT)
  * Calculates amount that has been added to pool for each token
  * If it's the first deposit, liquidity tokens to be rewarded are equal to sqrt of geometric mean
  * If it's a subsequent deposit, liquidity tokens tokens are equal to ratio of amount deposited already
  * Update the reserve amounts
  * Assert that the k is greater than or equal to the last k
  * Transfers the liquidity tokens to the user
  * Emits a `Mint` event

  Like Uniswap's, we "burn" part of the initial deposit to ensure that there is always some liquidity in the pool. We choose address(7) to send the unrecoverable funds to, instead of address(0) since OZ's ERC-20 implementation denies any minting to address(0).

  No special handling of space coin tax is necessary at this function because the SPC has already been transferred into the pool. So any calculations for liquidity are based on the actual and accurate amount of SPC received by the pool.

### *burn*
     function burn(address to) external withLock returns(uint256 receivedETH, uint256 receivedSPC) 
    
  * Calculates amount of liquidity tokens that were transferred back to pool
  * Retrieves proportionate amounts of ETH/SPC and send them back to user (function call returns these amounts)
  * Burn the liquidity tokens received
  * Emits `Burn` event

  When space coin tax is on, the following line may transfer less money to the end user if the `to` address is not the treasury since if the treasury takes the tax, the full transfer amount will have been sent to the treasury. 
      
      spaceCoin.transfer(to, receivedSPC)

  So afterwards, before we send back the `receivedETH` and `receivedSPC` we will do the following check to reflect the amount the end user received if the tax was on

        if(spaceCoin.taxEffective() && to != spaceCoin.treasury()) {
            receivedSPC = receivedSPC * 49 / 50;
        }

### *swapSPCToETH*

swapSPCToETH is very similar to swapETHToSPC share similar code and functionality. As mentioned earlier, you can only swap one token at a time in my implementation. 

* I enforce the tax in the swap code, not outside of the swap code 
* Calculate the deposited SPC into the pool based on the reserve balance
* Use constant product formula to calulcate the new ETH balance accounting for the 1% swap fee
* Calculate the withdrawable ETH amount based on the result of the last step
 
      uint256 withdrawETH;

        {
            uint256 newETHBalance = (balanceSPC * balanceETH) /
                (((99 * depositedSPC) / 100) + balanceSPC);
            withdrawETH = balanceETH - newETHBalance;
        }
* Send user back ETH
* Emits `Swap` event

Note there are no special handlings for SPC tax because at this function level, SPC has already been transferred into the pool.

One important caveat with my implementation is that because I strictly enforce the 1% swap fee in the function, I know for a fact that the user has paid the swap fee. Therefore in the minimum K calculation, whereas Uniswap removes the swap fee for the new K value calculation, I include it because it is not necessary for me to ensure that the user's requested amountOut accounts for the swap fee since that is guarenteed in my implementation. Here is the bit I'm referring to:

```
this means 0.3% (3/1000 = 0.003 = 0.3%) [the swap fee] is being deducted from the balance before comparing its K value with the current reserves K value.
```
https://ethereum.org/gl/developers/tutorials/uniswap-v2-annotated-code/


### *swapETHToSPC*

Similar to `swapSPCToETH` but in the reverse. 

Note we do check if SPC tax is enabled because we do a SPC transfer. The transfer tax will be handled by the coin, but we check for it so we can update the withdrawn SPC so the Swap event can contain the accurate SPC amount received by the user

    if(spaceCoin.taxEffective() && msg.sender != spaceCoin.treasury()) {
      withdrawSPC = withdrawSPC * 49 / 50;
    }

## SpaceRouter.sol

The router acts as a convinience wrapper utility that end users are intended to interact with. It handles much of the transfer and max-slippage logic. 

### *addLiquidity*
    function addLiquidity(
            address to,
            uint256 desiredSPC,
            uint256 minETH,
            uint256 minSPC
        )
            public
            payable
            withLock
            returns (
                uint256 actualETHIn,
                uint256 actualSPCIn,
                uint256 liquidityReceived
            )

  Adds ETH and SPC together since you deposit proportinate amount based off of the relative value of the balance of the pool. Rewards depositor with liquidity tokens back.

  The `desiredETH` is not a function argument but implied in the amount of ether this payable function receives. 

  If SPC tax is on, the router will only be able send 98% of the SPC approved for transfer, so we update this amount before we calculate the liquidity.

  The liquidity calculation is done in `_getLiquidity` and it will find the proportionate amount of SPC to ETH that is less than or equal to the desired SPC and desired ETH to add to the pool, but greater than the minimum amount of SPC and ETH parameters. 

    (actualETHIn, actualSPCIn) = _getLiquidity(
              msg.value,
              desiredSPC,
              minETH,
              minSPC
          );

  If it can find satisfactory amounts of SPC and ETH to deposit into the pool, we do one more check to see if SPC tax is on, if it is, we have to transfer a bit over the `actualSPCIn` (reverses the amount of we took off later). 

    if(spaceCoin.taxEffective()) {
      actualSPCIn = actualSPCIn * 50 / 49 ;
    }

  Then, we send the funds to the pool and call `mint` to reward the user with liquidity tokens

    spaceCoin.transferFrom(msg.sender, address(pool), actualSPCIn);
    pool.sendETH{value: actualETHIn}();

    (liquidityReceived) = pool.mint(to);

### *removeLiquidity*

    function removeLiquidity(
          address to,
          uint256 liquidity,
          uint256 minETH,
          uint256 minSPC
      ) external withLock

  Probably the most straightforward function implemented in this project: transfers liquidity tokens to the pool, and receives ETH and SPC back via `burn`. Since we checked for the SPC tax in `burn`, the return values of the amount of SPC and ETH received are accurate. We also do some simple checks to make sure the minimum amount of ETH and SPC received back was met.

### *swapETHForSPC*

    function swapETHForSPC(
      address to, 
      uint256 minSPCOut
    )
      external
      payable
      withLock
      returns (uint256 actualSPCOut)

* Uses `_getSwapAmount` to calculate the amount to of SPC that will be swapped out for ETH in (this function performs exactly the same calculation that the pool would do -- but in advance)
* Checks if the SPC out would be greater than or equal to the minimum specified (a.k.a checking for slippage) with SPC tax accounted for
* Sends ETH to the pool and calls the pool's swap function to obtain SPC back


### *swapSPCForETH*

* Similar to *swapETHForSPC* but in the reverse
* No explicit check for space coin tax because the SPC in is based on the amount in the pool after the transfer

# Design Exercise

## Question
How would you extend your LP contract to award additional rewards – say, a separate ERC-20 token – to further incentivize liquidity providers to deposit into your pool?

## Answer
Currently, liquidity providers are incentivized by the swap fee proceeds. However, we could also mint governance tokens (in proportion to their liquidity provided -- in the same quantity) so they can be incentivized by having a part to play in the upgradability or key-decisions (ex: increasing the fee, investing the fee to hire more developers, etc). Obviously, this would require changes to the contract so that the governance token would be used in the contract and the contract would need to support voting mechanisms similar to a DAO. 

Additionally, when liquidity is low in a pool or below a certain threshold, you can incentivize liquidity providers with an ERC-721 token, or an NFT. These NFTs can then be traded on the market, or can simply a a collector's item for helping the protocol achieve better liquidity and better rates.


# Deployment

The frontend code can be found in the `frontend-2` folder and requires an `npm install && npm start` to build the parcel project. It is hardcoded to interact with the contracts deployed on the Rinkeby Testnet. 

Router: https://rinkeby.etherscan.io/address/0xe9F5dAA7cF6Ff9cbeDC07D94111CA640fdf4d58F
Pool: https://rinkeby.etherscan.io/address/0xB0174d0b5770CCd494F158d64AED48a4B880e295
Space Coin: https://rinkeby.etherscan.io/address/0x5A19711FF0cB7f1588a42602817De2B9a3c6B7F9
Space Coin ICO: https://rinkeby.etherscan.io/address/0xd412844eE6686aF223cd6581934A50C276f7AB5A

The ICO has been advanced to the open phase by the treasury/deployer for easy testing.

The private keys for the treasury/deployer are here:
`7135d93e7946b90971dafc431e1a12c2e4737cb408309e375e7db32e747a402f`

Thanks for Reading!