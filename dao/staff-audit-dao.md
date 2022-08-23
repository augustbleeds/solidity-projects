https://github.com/0xMacro/student.augustjest/tree/73a0e2cad7764b5b8e885bfdfccda329c5856b8b/dao

Audited By: Gary

# General Comments

Excellent work.  You covered all the requested functionality. 

 The cancel function design is interesting though. According to your readme, you added this function to be able to cancel an already passed proposal. This was done in case suddenly the contract proposal A was going to call is hacked, and you needed a way to prevent the proposal to be executed.  However, this function could also be abused.  Take for instance a proposal that barely passed with just a quorum, and many voters abstaining.  The losing voters could rally other DAO members to reverse the winning proposal with a proposal to cancel the winning proposal with set execution time sooner than the first proposal.  I see this as an vulnerability.  However, since we give you leeway in designing your voting system and you documented it in your readme, no points will be added.  

 It is also interesting in `buyNFT`, you revert only if the contract does not have enough funds to purchase the NFT or if the NFT price is greater that the max price from `market.getPrice()`, but do not revert if the `market.buy()` fails and returns false.  Thus, the proposal will be only be able to be executed once, unless there is an issue with the price. Again you documented it and it will be OK. 

 I like how you prevented re-entrancy on  `cancelProposal` and `buyNFT` by using the modifier `onlyDao` - so that only the
 contract itself can call these external functions.  

 Good job with the test cases. However, you should add some cases to cover totalMembers < 4. You would have uncovered the issue with 3 totalMembers.  Also, the `GoodMarketplace()` contract could be cleaned up.  You are returning nftID on `getPrice()` instead of price and hardcoding values in `buy()`. Also `BadMarketplace()` is not being called anywhere. 

 Good job documenting your voting system in the readme. However, you did fail to discuss the risks and tradeoffs of said system.  Nonetheless, excellent work overall.     

# Design Exercise

Q-1 - Good explanation on how the voting delegation would be mapped!  You could have added more details on how the mapping would be used in the voting function.  What happens to A's votes if A delegates to B and then B delegates to C? 

Q-2 -  Yes, gas cost would increase in transitive vote delegation. Think about this situation on a more technical level - 
transitive vote delegation is absolutely problematic because undelegation logic can get really tricky: Imagine A delegates 
to B, and then B delegates to C, then C delegates to A again. What if A wants to undo their delegation to C? We'd need a 
loop to keep track of all the delegation history, which at the time of undoing could become really expensive if there has 
been many delegations.

# Issues

**[M-2]** Not checking return code after each call function in `execute` 

This is problematic as having any function revert in the context is not actually apparent without replaying it.  The bigger concern is that any series of functions in order will have a real problem if they were reliant on the one above reverting. 
Since ETH is being passed in the call, actual ETH could be lost.  

**[Technical-error]** Quorum calculation incorrect for totalMembers = 3

In `quorum()` lines 152-154 you are calculating the quorum for 3 totalMembers to be 2.  It should be 1. 

**[Q-1]** castVoteBySigBulk is brittle

If any of the votes is reverted then the entire batch will be reverted and it will not be obvious which vote caused the 
failure. Consider letting invalid votes/signatures silently fail, and having off-chain applications listen for a VoteCast events.

**[Q-2]** Immutable / single NftMarketplace variable

There are more than one marketplace that NFTs can be bought and sold, and your contract is limited to one. You are passing 
it in the constructor. Consider adding this as an argument passed in by the proposer, rather than the constructor.

**[Q-3]**  Naming of constants

Constants should be named with all capital letters with underscores separating words. Examples: MAX_SEED_RAISE, 
MAX_GENERAL_RAISE, MAX_SEED_CONTRIBUTION, MAX_GENERAL_CONTRIBUTION

See:  [Naming styles](https://docs.soliditylang.org/en/v0.8.9/style-guide.html#naming-styles)

Consider changing name to NAME on line 45

**[Q-4]** additional contract in project not related to the project

`Greeter.sol` is in project which based on the test scripts you are using for testing.  Consider putting this contract along with `Marketplace.sol` into a test directory so auditors would know not to audit these contracts.  

**[Q-5]** Not all functions have an event emitted.

Consider emitting events for `buyMembership()` and `castVote()` so that members know they have been added, and their votes 
were counted. 

# Nitpicks

- The following snippet of code could be re-written
```
Line 112
require(msg.value == REGISTRATION_FEE && isMember[msg.sender] == false, "REGISTRATION_FAILED");

Line 167
require(proposals[_proposalId].created == false, "ALREADY_EXISTS");

```

TO
```
Line 112
require(msg.value == REGISTRATION_FEE && !isMember[msg.sender], "REGISTRATION_FAILED");

Line 167
require(!proposals[_proposalId].created, "ALREADY_EXISTS");
```


# Score

| Reason | Score |
|-|-|
| Late                       | - |
| Unfinished features        | - |
| Extra features             | - |
| Vulnerability              | 2 |
| Unanswered design exercise | - |
| Insufficient tests         | - |
| Technical mistake          | 1 |

Total: 3

 Great job!
