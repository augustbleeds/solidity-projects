# TL;DR
A decentralized crowdfunding contract with specific rules that protect both sides of the marketplace and awards NFTs to contributors based on the contribution amount.

# Specifications
- Project
    - Allow creators to register their projects to raise funds
    - Each project can only have 1 creator
    - Creator specifies the contribution limit
    - Funding goal cannot be altered after the project is created
    - Project expires after 30 days from the beginning of the fundraising
- Contributing
    - Allow contributors to contribute ETH to a creator's project
    - Creators can be contributors to their own project (as well as any other project)
- Creator Withdrawing
    - Allow creators to withdraw "the funds" as soon as "the goal" has been met
        - Creator is able to withdraw funds to a different address
    - Any excess amount over the project goal will be considered part of the funding and the creator is able to withdraw it towards their project
    - Push or pull withdrawal system is fine. But a pull system is more resistant to security vulnerabilities.
- Refunds
    - If project expires and the funding goal is not met, all contributors will get their money back
    - Contributors may get their money back via a pull-based approach
    - A contributor can’t withdraw funds prematurely. Only way for them to get money back is if the project expires
- Awarding NFTs
    - Sends a "contributor badge" NFT to contributors who contribute 1 ETH
    - If the project doesn’t meet the monetary goal, contributors can still keep the NFT
    - NFT has no special attributes or characteristics besides being able to be traded
- No hard limits for contribution goals, contribution amount in a transaction, # of contributions per address, # of times an NFT can be traded, and # of contributor badges

# Summary

## Project Factory
* create() is a factory method which creates a new Project contract. It adds the address to an array for book-keeping (not really used in this project but nice to have)
* allProjects() returns the addresses of all deployed Projects. This is very convinient for testing as well because we can assert not only the recent project addresses but the total number of addresses deployed so far with the size of the array

## Project
* Project inherits from the OZ ERC-721 implementation. It is instantiated with a important data such as the fund goal, creator address, and project/token names and symbols (both project and token have the same name and symbol)
* A Project's status is determined by calling the status() function. This declarative approach of finding the status (thanks Melville for pointing this out) makes it easy to understand how a project gets to a certain state rather than chasing breadcrumbs from setting a state variable in different functions (my initial approach). It's worth noting that FAILED encompasses both failure and cancelled modes since they are functionally equivalent (but they have different state transitions to get to that state).
* One thing to note about contribute() is that it will mint fresh NFTs everytime a user deserves one. So the address which it is transferred from is 0 because it had no previous owner. I made sure that if a user deserves multiple NFTs in one contribution, they are awarded it by implementing a for loop. I'm aware that if there are too many NFTs to mint, the transaction's gas could run out and everything could revert. One optimization in the future is to ensure there's a fixed amount of gas before attempting to run another iteration of the for loop.
* refund and withdraw both have re-entrancy guards in order to prevent a malicious contract from calling the same function in order to obtain more money.


# Design Exercise

Question: 
Smart contracts have a hard limit of 24kb. Crowdfundr hands out an NFT to everyone who contributes. However, consider how Kickstarter has multiple contribution tiers. How would you design your contract to support this, without creating three separate NFT contracts?

Answer:

One way to introduce contribution tiers is to have each NFT have a property of which tier it belongs to.

You can define a struct that holds the tier level and a mapping that associates each tokenId with its badge data.

```sol
enum Tier { ONE, TWO, THREE }
struct BadgeDetails {
    Tier level;
}
// this mapping will map tokenId to the badgeDetails metadata. 
// just do a lookup of badges[tokenId] to retrieve the level
mapping(uint256 => BadgeDetails) public badges;

uint256 constant tier1Amount = 1 ether;
uint256 public tier2Amount;
uint256 public tier3Amount;
```

You’ll need to set the tier thresholds. For simplicity sake, I set the tier 1 threshold to be 1 ether. The monetary thresholds for the other two tiers can be set in the Project constructor as follows. You’ll also want to check that the tiers are strictly monotonically increasing.

```sol
constructor(uint256 _fundGoal, address _creator, string memory _name, string memory _symbol, uint256 _tier2Amount, uint256 _tier3Amount) ERC721(_name, _symbol) {
  fundGoal = _fundGoal;
  creator = _creator;
  createdDate = block.timestamp;
  require(tier1Amount < _tier2Amount && _tier2Amount < _tier3Amount, "Tiers have to be strictly monotonically increasing"); 
  tier2Amount =  _tier2Amount;
  tier3Amount = _tier3Amount;
}
```

Lastly, when you mint a token in the contribution() function, you’ll need to determine the tier based on the contributions amount and then create the BadgeDetails associated with the token id belonging to the freshly minted token

```sol
if(tokensOwed > 0) {
  Tier t;
  if(contributionsTruncate >= tier3Amount) {
      t = Tier.THREE;
  } else if (contributionsTruncate >= tier2Amount) {
      t = Tier.TWO; 
  } else {
      t = Tier.ONE;
  }
  for(uint256 i = 0; i < tokensOwed ; i++) {
      uint256 newTokenId = _tokenIds.current();
      _safeMint(msg.sender, newTokenId);
      badge[newTokenId] = BadgeDetails(t);
      _tokenIds.increment();
  }
 }
 ```