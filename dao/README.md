# CollectorDAO

## TL;DR
A DAO where members can vote to put forward proposals, vote, and execute arbitrary EVM functions on-chain. I also added a novel proposal cancellation feature which cancel proposals still pending executions.

## Rules

### Membership

Anyone can become a member to CollectorDAO so long as they pay the 1 ETH membership fee.

### Voting System

The voting system is straightforward: one member has one vote per proposal. For a proposal to pass, at least 25% of members must have voted on the proposal. A vote can either be "for", "against", or "abstinent". "Abstinent" votes are counted neither for nor against a proposal but are used to encourage participation and count towards quorum. Passed proposals must have more "for" votes than "again" votes (note this means when "for" and "against" are tied the proposal is not passed -- so all abstinent votes would not pass a proposal).

Users (non-members or members) have the ability to tally members' votes if the members sign the votes.

### Proposals

Any member can offer a proposal. A proposal is essentially a set of EVM function calls. Each proposal is uniquely identified by its target addresses, ether sent with each call, EVM call data, and a description. The description field is so that identical sets of calls can be proposed again in the future. For example, maybe every month the CollectorDAO votes whether or not to send 10% of funds back to all members.

Every proposal has an expiration date for voting.  Additionally, every successfully passed proposal has a minimum duration it has to wait before it can be executed (you can think of this as a lockup period). We suggest each passed proposal has a generous lockup period in order to provide some time if it needs to be cancelled (more later).

For members to easily propose NFTs, they can simply propose the execution of CollectorDAO's `buyNFT()` function.

### Cancellation
Imagine proposal A passes. However, suddenly the contract proposal A was going to call is hacked! In these cases, as long as proposal A has not been executed yet, it can be cancelled via the proposal mechanism. This is made possible because CollectorDAO has a function `cancelProposal()`. In order to cancel proposal A, members need to offer proposal B which calls `cancelProposal()` and execute it before proposal A is executed. Obviously, this means the vote duration and execution lockup period for proposal B must be judiciously selected so it can be executed before proposal A. Note that anyone can execute proposal A (even non-members) once the execution lockup period has passed, therefore it is all the more important for proposals to have a generous lockup period.

## Contract Summary Details

### Events

- `ProposalExecuted(uint256 proposalId, bool success);`
  - Emitted whenever a proposal is executed. If this event is fired, it basically means this proposal cannot be executed again. Therefore success does not refer to whether or not this proposal was deemed "executed" by the dao but it means whether or not the underlying calls the DAO made were successful. 
  - Ex: If DAO makes a call to execute a trade in the stock market and the trade fails because the price is high, success is false but the proposal was executed.
- `NFTBid(uint256 nftId, uint256 price, bool bidSuccess);`
  - This is emitted whenever the `marketplace.buy()` function is called and returns a value (and does not revert). This means the buy function was successfully called. If it reverts, it will not be emitted, but the proposal will be executed. 


### Functions

- `function castVoteBySig(address voter, uint256 proposalId, uint8 support, uint8 v, bytes32 r, bytes32 s) public `
  - In addition to sign data (v, r, s) and voting information (support and proposalId) we also require the voter who signed the data in order to protect against the case where a non-sensical addresses is returned by `ecrecover`. This voter address would not have been private anyway (it could be recovered by anyone)
- `function buyNFT(uint256 maxBuyPrice, address nftContract, uint256 nftId) external `
  - Since we've been told we can trust the marketplace, we choose to not bother checking for re-entrancy vulnerabilities or whether or not we really receive the ERC-721 coins when the `marketplace.buy()` returns true. This will save us some gas.

## Design Exercise

### Question
```
Per project specs there is no vote delegation; it's not possible for Alice to delegate her voting power to Bob, so that when Bob votes he does so with the voting power of both himself and Alice in a single transaction. This means for someone's vote to count, that person must sign and broadcast their own transaction every time. How would you design your contract to allow for non-transitive vote delegation?
```

### Answer

We could keep a mapping called `delegationPower` which would tell us how many delegated votes an individual has. We'd then use this value for voting, making sure to check the `voteDelegatedTo` to see if the person voting has their vote delgegated away. 

```
mapping(address => address) public voteDelegatedTo;
mapping(address => uint256) public delegationPower;
```
If someone takes away their delegate, we just set `voteDelegatedTo[user] = address(0);` and decrement the delegationPower entry of the user who previously received their delegation.


### Question


```
What are some problems with implementing transitive vote delegation on-chain? (Transitive means: If A delegates to B, and B delegates to C, then C gains voting power from both A and B, while B has no voting power).
```

### Answer

If Bob delegates to Alice with no transitive dependency, we'll only need to updated Bob's `voteDelegatedTo` once. However, if Bob delegates to Alice with transitive dependency, we'll need to update Bob's `voteDelegatedTo` as well as everyone who delegated to Bob. The only way we'll need to know who delegated to Bob was by keeping a list of record per each user. This effectively changes delegation from a O(1) operation to a O(n) because Bob could have multiple people delegated to him. The most costly portion of this is contributed by the gas costs for storage. The gas costs, past a certain point would be enough that it would discourage delegation.




