https://github.com/0xMacro/student.augustjest/tree/dddaab903d29f54b174e84821036cda531c35010/lp

Audited By: Brandon Junus

# General Comments

Overall, great job on the project! There's just a few small but key things to fix that weren't in the spec, but overall I think you understood the LP's well.

To be honest, I think a few of the issues may be caused by looking at the original Uniswap contracts too much in your implementation, causing you to add a bit of unnecessary code, but I still am pretty confident that you understand LP's well.

# Design Exercise

Great job on the design exersize! As a follow up question, how often would you mint governance tokens, or what system would you set up to mint governance tokens?

# Issues

**[M-1]** Router’s add liquidity function leaves excess ETH in the Router

In your add liquidity function, which eventually calls pool's mint function, it's possible to transfer in X amount of ETH, have less a value less than X be deposited in the pool (because the reserve amounts changed since your transaction was broadcasted). This excess ETH is added to the Router, instead of being sent back to the caller. See this line of UniswapV2 Router code for a concrete example of how this edge-case was fixed:

https://github.com/Uniswap/v2-periphery/blob/master/contracts/UniswapV2Router02.sol#L99.

Consider calculating any excess ETH that is left over, and send it back to the caller.

**[Extra feature]** Reentrancy guard not necessary for `sendETH()`

You include a nonReentrant modifier in your `sendETH()` function. I admire your caution and curiosity about guarding against reentrancy!

However, this function does not call out to any external contracts, so reentrancy is not possible.

Consider removing it to save on gas costs.

Also, it is a bit confusing that you created a separate function for what essentially amount to a fallback function. It might be confusing to users as they may just be used to sending ETH to a contract by hitting the fallback function. Consider just using "receive" as a fallback function instead.

**[Q-1]** ETHSPCPOOL Line 73 declares rewardLPT for no reason.

The variable is already declared when you declare a return value, you don't need this line of code.

# Nitpicks

- There's some commented out tests in your project. Probably should remove them! (especially if you plan on posting this publically on your github for potential employers to see)
- You have a bit of scope brackets in your code (see swapETHtoSPC, lines 196 to 199). I think you just copied it from uniswap's original code and it is not needed here. From my understanding, the scope brackets are there to avoid "stacks too deep" error, which is caused by having too many local variables. I dont think this is the case for your code. I think you could remove it and there shouldn't be any issues.

# Score

| Reason                     | Score |
| -------------------------- | ----- |
| Late                       | -     |
| Unfinished features        | -     |
| Extra features             | 1     |
| Vulnerability              | 2     |
| Unanswered design exercise | -     |
| Insufficient tests         | -     |
| Technical mistake          | -     |

Total: 3

Great job!
