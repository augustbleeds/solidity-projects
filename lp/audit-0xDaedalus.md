Peer micro-audit by Alex Bazhenov

Great contract - had a tough time finding vulnerabilities. Love how you split out swapETHtoSPC and swapSPCtoETH.  To be honest I'm not too sure about L-1 but I know that uniswap takes fees from both sides to I assume we were supposed to as well.

## **[Q-1]** Unnecessary variable declataion.

On line 73 in ETHSPCPOOL.sol you declare `rewardLPT;` but I don't think you need to explicitly declare it there since it is declared as part of the `returns` parameter.  Consider omitting the declaration

## **[L-1]** Not accounting for 50% of LP Provider Fee

On lines 167 and 206 in ETHSPCPOOL.sol - you check that the k-constant of the pool has not decreased - but you only take the fee from one of the assets being swapped in the lines above (`newETHBalance` and `newSPCBalance` - respectively).  I believe the fee is supposed to come from both sides of the LP pool - e.g. 1% of deposited ETH _and_ 1% of the received SPC when swapping ETH to SPC.  I