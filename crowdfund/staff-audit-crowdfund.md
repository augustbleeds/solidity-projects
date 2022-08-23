https://github.com/0xMacro/student.augustjest/tree/ee3b744d0ff5daaafc872a01ca0f9d26ce925da2/crowdfund

Audited By: brianwatroba

# General Comments

1. I really appreciated the thoroughness of your readme. It's a key starting point for auditors to understand your code, and it always leaves an immediate great impression when someone has taken the time to document the structure of their project (including features/tradoffs). This instinct will be valuable for you as you work on the different projects in the fellowship, especially the DAO project which requires more extensive documentation. Great work!
2. You're especially throrough with your `require` checks and error handling. Something tells me this is an instinct you have from success in Web2, which is great! The biggest challenge in Solidity isn't that the code works, but that it doesn't break. Security is paramount, and extensive require checking and error handling is essential to airtight contract development. Love it!
3. You caught a lot of key "gotchas" on your first project, which is awesome! For instance: you implemented the Checks Effects Interaction pattern to guard against re-entrancy, used `safeMint()` to ensure receivers can receive ERC721s, etc. This really shows that you absorbed the pre work and made an effort to implement what you learned and go the extra mile. That's awesome to see.
4. I really like how you used the `status()` function to determine project state rather than storing a specific state variable. Since status is dependent on a number of different variable values, it's cleaner and cheaper to simply read and compute those values than continually updating specific "state" storage variable. Great work!

_To think about:_

1.  I've included a number of stylistic recommendations under Nitpicks to help guide you as you continue your Solidity journey. This isn't meant to be overly presecriptive, but instead to help familiarize you with style standards that the community is used to.

# Design Exercise

Really awesome answer. Your solution covers all bases: it provides tiered functionality that is highly transparent (via a public mapping and view function), stores it within the same contract, and preserves the main functionality of a ERC-721. I really appreciate how much time you took to write out actual code and show how you'd implement. This shows you really thought through the problem on an implementation rather than just theoretical level. Awesome!

_To think about_:

1. What are the tradeoffs of this system? For instance, higher contract storage needs, visibility and clarity to users on which tier they own (requires a view function call), etc.
2. I encourage you to check out a different token standard: [the ERC-1155 standard](https://docs.openzeppelin.com/contracts/3.x/erc1155). It's essentially a fused ERC-20 and ERC-721 that allows for both to exist in the same contract. It's used by a lot of game developers as games need to have distinguished items. I actually use it in my day job at Stardust.gg! The main tradeoffs, however, is not all external and decentralized exchanges/marketplaces accept 1155, so we often have to write proxy contracts to interact with 1155 as ERC-20/ERC-721.

# Issues

**[M-1]** Reentrancy allows for greater than expected number of badge mints

In your `contribute()` function, you calcluate the number of tokens someone is owed based on their current balance of NFT badges vs. cumulative contributions.

You then mint those NFTs one at a time in a for loop (line 68). Each of the loop iterations makes a call to ERC-721's `_safeMint()`. `safeMint()` is useful because it ensures an NFT recipient can in fact receive it via the `checkOnERC721Received()` callback. However, that same callback also has an additional unsafe characteristic. [The 721 check callback](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/7c75b8aa89073376fb67d78a40f6d69331092c94/contracts/token/ERC721/ERC721.sol#L262) actually opens up a re-entrancy risk, because a malicious user can create a reentrant call inside it.

Because you mint the NFT badges individually within the for loop, on the first iteration an attacker could re-enter the `contribute()` function with additional ETH and receive more NFTs than earned. Let me explain with an example.

1. Initial `contribute()` call with 4 ETH donation. Would be entitled to 4 NFTs.
2. That call gets to line 70 and mints the initial NFT. The attacker now has 1 NFT. Within that minting, they recursively call back into the contract with an additional 3 ETH contribution.
3. Because the first mint worked, the user has 1 NFT, but technically a cumulative donation amount of 7 ETH in this second (re-entrant) call. So they'd receive 6 NFTs (7-1), plus the original 4 for the initial call.
4. An attacker gets 10 NFTs for 7 ETH contributed.

Consider adding a re-entrancy guard for your `contribute()` function.

**[M-2]** Contributors can exploit NFT awards to get more than deserved

A contributor should be awarded an NFT for each 1 ETH contributed to a project.

When you calculate the number of NFTs to award, you're basing it on a
contributor's total contributions to date (using the `balanceOf()` function), which returns the number of NFTs they
_currently own_.

Edge cases where this can be manipulated:

1. A contributor buys NFTs from someone else
2. A contributor sells previously awarded NFTs or transfers them away

This exposes an exploit whereby a contributor can continually continually
transfer NFTs to an associate or to another account they own, while getting
replacement NFTs in exchange for minimal subsequent contributions.

Consider checking deserved NFTs against past NFTs awarded instead of NFTs
currently owned.

**[Q-1]** Using modifiers for repeated require checks

In your `withdraw()` and `cancel()` functions you include individual require checks to ensure `msg.sender == creator`. This is great!

However, Solidity allows you to write modifiers so you can repeat logic checks and not re-write them each time. A good rule of thumb is whenever a require check is used more than once, it's appropriate to replace them with a modifer that each function can share.

For example:

```Solidity
modifier onlyCreator {
    require(msg.sender == creator, "must be project creator");
    _;
}
```

If you wanted to further refactor, you could also create modifiers for specific Project state, e.g. `mustBeActive()`, etc.

Consider using modifiers for any require checks used more than once.

**[Q-2]** Conditional logic: enforcing the needed state

In your `withdraw()` function, you include a number of if/else conditionals to show the correct error messages based on a number of cases: project isn't active, project is cancelled, etc. This adds a lot of specificity to the user experience and helps Creators understand what might have went wrong in their call.

However, it does also add to contract size. In writing Solidity and error handling, it's often a good practice to just "enforce the needed state". In the case of `withdraw()`, it can only be called in one case: when a Project has succeeded.

In this vein, you could replace your require statements (outside onlyOwner) to simply check for `require(status() == ProjectState.SUCCESS), "Project.sol: PROJECT_MUST_BE_SUCCEEDED"`. This cuts down on conditional trees and signals to the user that `withdraw()` will only work in one case, which will become clear they are not meeting (and why). You do this really well in your `contribute()` function.

Consider minimizing require statements to enforce the needed state.

**[Q-3]** Use NatSpec format for comments

Solidity contracts can use a special form of comments to provide rich
documentation for functions, return variables and more. This special form is
named the Ethereum Natural Language Specification Format (NatSpec).

It is recommended that Solidity contracts are fully annotated using NatSpec
for all public interfaces (everything in the ABI).

Using NatSpec will make your contracts more familiar for others audit, as well
as making your contracts look more standard.

For more info on NatSpec, check out [this guide](https://docs.soliditylang.org/en/develop/natspec-format.html).

Consider annotating your contract code via the NatSpec comment standard.

**[Q-4]** Inheriting from contracts not in spec

In your contracts you inherit from Open Zeppelin's `Counters.sol`.
I admire your curiosity and resourcefulness in drawing from OZ's library of
battle tested contracts, but for the purposes of learning, it's important to
only use outside contracts in your course projects if the spec specifically
permits it.

You can replicate the counters functionality with respect to NFT badge IDs with storage variables and incrementing.

Consider refraining from inheriting other OZ contracts in your code unless specified explicitly in the spec.

**[Q-5]** Leaving hardhat/console.sol in production project

Your contract imports hardhat/console.sol, which is a development package.

Consider removing hardhat/console.sol from your production code.

# Nitpicks

- In your `status()` function, you can combine your two failure cases with an `||` operator.
- Instead of repeatedly calculating `createdDate + 30 days`, you could instead just save an `endDate`, which is the initial create time + 30 days.
- `withdraw()` is never called internally, could be marked `external` visibility
- Error strings are often written `LIKE_THIS` by convention. When a project has mutliple contracts that interact, it is also common to designate which contract the error is coming from for easier error tracing. Instead of `"Project must be active to be cancelled"` on line 61 of Project.sol, consider writing `Project.sol: PROJECT_NOT_ACTIVE`. Solidity has also recently introduced custom errors, which you can also use.

# Score

| Reason                     | Score |
| -------------------------- | ----- |
| Late                       | -     |
| Unfinished features        | -     |
| Extra features             | -     |
| Vulnerability              | 4     |
| Unanswered design exercise | -     |
| Insufficient tests         | -     |
| Technical mistake          | -     |

Total: 4

Great job!
