# TL;DR

An ICO for an ERC-20 meme-coin "space coin" that has 3 stages for private investors, limited contributions, and unlimited contributions up to the total funding amount. SPC has a transfer tax.

# Deployment Info

I’m certain that SpaceCoin will be the next big thing! Just buy it now while you can and don’t worry about it…what does it do? uhh in the future …yes, in the future it’ll allow you to ….vote on space exploration proposals as part of the first space exploration DAO.

## Frontend

- The Rinkeby contract addresses are hard-coded in the `index.js` file
- Made sure to listen when account changes to pull new data

Screenshot Example of an Error (doesn’t look the prettiest but retro is in nowadays anyway!)
![Frontend Screenshot](ico-frontend-template/screenshot.png?raw=true "Title")

### (Local) Deployment

```
cd ico-frontend-template && npm start
```

## Backend

- SpaceCoinICO and SpaceCoin are deployed on the Rinkeby test network
- SpaceCoinICO deployed to: 0x6dC6048a47e327687647c0Deb23B90EC0C1fEf99 (<https://rinkeby.etherscan.io/address/0x6dC6048a47e327687647c0Deb23B90EC0C1fEf99>)
- SpaceCoin deployed to 0x59220Fe076A7C5b861730EbFcE434818d7b27BeA (<https://rinkeby.etherscan.io/address/0x59220Fe076A7C5b861730EbFcE434818d7b27BeA>)
- Treasury Private Key
  - `21597721e391a06f615a1feb145990a23238fd88004bc1f48360ea4b16aadf74`
- Owner/Deployer (of SpaceCoinICO) Private Key
  - `7135d93e7946b90971dafc431e1a12c2e4737cb408309e375e7db32e747a402f`

# Design Summary

## SpaceCoin (SPC)

- Inherits from OpenZeppelin’s ERC-20 contract
- It is to be deployed by the ICO contract instead of an external account (more on that later)
- notes
  - methods
    - `constructor()`
      - sets the treasury and owner of the contract (both which are external accounts) and mints 150k and 350k SPC
    - `_transfer(address from, address to, uint256 amount) internal override`
      - overrides the equivalent ERC-20 virtual method
      - this _transfer function is called in the public facing `transfer()` function
        - it is basically a wrapper around the superclasses’s `_transfer()` function in order to charge a tax when applicable
        - note that if you are transferring to the treasury when tax is effective, you can skip the usual tax calculation because everything is going to the treasury anyway (just like in real life!)

## SpaceCoinICO

- Spec that I implemented
  - ICO will deploy the SPC token. This is mainly to save gas in one single deployment and reduce any user error from setting the SpaceCoin address incorrectly in the ICO contract. Also it mitigates developer hassle from deploying two contracts separately which are otherwise going to be used closely together
  - The ICO is smart enough to accept as much as it can in a given funding round or given an individual’s contribution limit. It will accept as much as it can up to but not exceeding the limit and refund the rest to the user. For example, if the seed phase fund is at 14,000 ETH and Alice sends 1,001 ETH, she will be refunded 1 ETH, 1000 ETH will be accepted by the contract, and the seed phase limit will be reached. Similar logic holds if a contribution would exceed the individual limit.
  - I added extra functionality to be able to remove seed investors from the allow lis
  - During the open phase, SPC is redeemed for ETH contributions automatically. In other words, by the end of the contribution transaction during the open phase, the user will have SPC belonging to their address
- Notes
  - methods
    - `contribute()`
      - Given the refund functionality, the contribute function has a decent amount of logic in it. I’ll try to boil it down to basic steps so the code is easier to audit
                1. Check if the fund or individual limit has been reached and some other checks in `_checkValidityOfContribution()`
                2. Set a contributionLock so that this and other functions cannot be re-entered via the .call method that transfers the refund
                    1. if there was no contributionLock, an attacker could re-enter the contribute function, which isn’t a huge vulnerability but it would corrupt some of the events emitted
                3. Calculates two different values, valid contribution adjusted for the individual limit vs. valid contributions adjusted for the fund limit, picks the lower of the two, and refunds the excess. For example, speaking generally, if individual contribution is 9, individual limit is 10, current fund is 3, and fund limit is 5 and amount to contribute is 9, valid contribution adjusted for individual limit is 1 (10-9) and valid contribution adjusted for fund limit is 2 (5-3). We would pick the former so we’d effectively contribute 1 and be refunded 8
                4. At the end of the function, if we are in the open phase, we redeem SPC for the user automatically. Note that there is an internal version of redeem which does not check for the contribution lock
  - modifiers
    - `contributeNotInProgress`
      - This modifier has been added to most of the external functions because it would not make sense for a user, even the owner, to perform a state change during a contribution. This would only corrupt the event data. For example, if `setPausedState` did not have this modifier, the owner could theoretically pause the contract before the contribution had been complete and a Contribute event would be admitted in the paused state which is odd
  - event
    - `event Contribute(address investor, uint256 totalContribution, uint256 lastContribution, bool individualLimitReached, bool fundLimitReached);`
    - each Contribute event can tell you a lot about the contribution event, including whether or not any limits have been reached. A client can then listen for this data by querying the transaction log.
  - fields
    - `purchased` vs `currentContributions`
      - currentContributions describes how the user’s existing contributions to the ICO which have not been redeemed
      - purchased describes how much ETHs worth of coins the user has purchased. This value is used because the amount of SPC a user has is not necessarily the same as the amount they purchased from the ICO (they could’ve gifted some away or been gifted some)

# Design Exercise

## Question

The base requirements give contributors their SPC tokens immediately. How would you design your contract to **vest** the awarded tokens instead, i.e. award tokens to users *over time*, linearly?

## Answer

Assuming that linearly means its vested continuously, this can be achieved by using the total vesting time, begin vest date, current date, and total amount to be vested.

Because each contribution has its own vesting date, we will need to calculate the total vested amount by summing across all of the user’s contribution as a list. This list of data per person could get sufficiently long for an individual, so we can store some helpful data like the amount that is fully vested and the index in the list pointing to the contribution that is partially vested. Everything before this index would be fully vested. Then, the redeem function only needs to calculate the remaining entires in the rest of the contribution list.

However, there is a tradeoff in that if these redemption arrays are not that long and hence the lookups are not that expensive, it might save storage costs to just remove storing the extra metadata.

In the redeem() function, instead of redeeming everything at once, we can have partial redemption (just like you can do with vested stock options). However, for simplicity sake we will not be issuing refunds to the user in the redeem function

```
  // ...

struct ContributionRecord {
 uint256 amount;
 uint256 date;
}

struct ContributionHistory {
 uint256 partialVestedIndex;
 uint256 fullyVestedAmount;
 ContributionRecord[] records;  // in increasing order
}

mapping (address => uint256) public redeemed;

mapping (address => ContributionHistory) public history;

//...

constructor(uint256 _vestingPeriod) {
 // ...
 vestingPeriod = _vestingPeriod
 // ...
}

function redeem(uint256 amount) external {
 // see how much is vested 
 uint256 vestedAmount = fullyVested;

 ContributionHistory h = history[msg.sender];

 for(uint256 i = h.partialVestedIndex; i < h.length; i++) {
  ContributionRecord r = h.records[i];
  uint256 rawAmount = r.amount * (block.timestamp - r.date) / vestingPeriod;

  if(rawAmount >= r.amount) {
   fullyVestedAmount += r.amount;
   partialVestedIndex += 1;
   vestedAmount += r.amount;
  } else {
   vestedAmount += rawAmount
  }
 }

 require(redeemed[msg.sender] + amount <= vestedAmount, "REDEEMED_AMOUNT_EXCEEDED");
 redeemed[msg.sender] += amount;

 spaceCoin.transfer(msg.sender, amount);
 
 // ...
}
```

# Advanced Sample Hardhat Project

This project demonstrates an advanced Hardhat use case, integrating other tools commonly used alongside Hardhat in the ecosystem.

The project comes with a sample contract, a test for that contract, a sample script that deploys that contract, and an example of a task implementation, which simply lists the available accounts. It also comes with a variety of other tools, preconfigured to work with the project code.

Try running some of the following tasks:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.ts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

# Etherscan verification

To try out Etherscan verification, you first need to deploy a contract to an Ethereum network that's supported by Etherscan, such as Ropsten.

In this project, copy the .env.example file to a file named .env, and then edit it to fill in the details. Enter your Etherscan API key, your Ropsten node URL (eg from Alchemy), and the private key of the account which will send the deployment transaction. With a valid .env file in place, first deploy your contract:

```shell
hardhat run --network ropsten scripts/deploy.ts
```

Then, copy the deployment address and paste it in to replace `DEPLOYED_CONTRACT_ADDRESS` in this command:

```shell
npx hardhat verify --network ropsten DEPLOYED_CONTRACT_ADDRESS "Hello, Hardhat!"
```

# Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).
