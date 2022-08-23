# Crowdfund Peer Micro Audit

## **[M-1]** Anyone has the ability to toggle token tax

One line 25, SpaceCoin.sol has the following function:

```solidity
function setTax(bool tax) external returns (bool) {
  if (tax != taxEffective) {
    taxEffective = tax;
  }
  return taxEffective;
}

```

While the contract has an `owner` address and a similar mechanism exists in SpaceCoinICO.sol (with onlyOwner), this function in SpaceCoin.ico is not protected and can therefore be called by any address. This has major monitary and usability implications for SpaceCoin.

## **[Q-1]** setTax() return value not as intuitive

One line 25, SpaceCoin.sol has the following function:

```solidity
function setTax(bool tax) external returns (bool) {
  if (tax != taxEffective) {
    taxEffective = tax;
  }
  return taxEffective;
}

```

The `returns (bool)` can mistakenly be interpreted as a success or fail boolean, especially considering the overriden function `_transfer()` uses the same pattern right below.

Consider: A) restructuring this relatively simple function to be consistent with the `_transfer()` return pattern or B) used named return values. In this case perhaps `return (bool newTaxValue)`

## **[Q-2]** Redundant Code

On line 102, SpaceCoinICO.sol has the following:

```
if(currentContributions[msg.sender] == SEED_INDIVIDUAL_LIMIT){
    revert MaxIndividualContributionFilled(msg.sender);
}

// if assert occurs, somehow seed investor was able to exceed contribution limit. This is very wrong!
assert(currentContributions[msg.sender] <= SEED_INDIVIDUAL_LIMIT);
```

These are effectively two of the same statements one after another. Consider removing the top one, since the bottom one is more inclusive.

## **[Q-3]** Use of magic numbers in important parts of code: tax and rate calculation.

On line 36, SpaceCoin.sol has the following

```solidity
// rounds down to if amount is not divisible by 50
uint256 taxAmount = (amount) / 50;
```

Similarly, SpaceCoinICO.sol line 81 has the following:

```solidity
uint256 spcToTransfer = currentContributions[msg.sender] * 5;
```

Correct math is done in both places: calculating the 2% transaction fee, and the rate. However, these statements are not as easy to understand since nowhere in the contract references a 2% transaction fee, nor the SPC<->ETH rate.
Consider: removing these [magic numbers](<https://en.wikipedia.org/wiki/Magic_number_(programming)>), doing something like the following:

```solidity
 uint256 fee = (amount * FEE_PERCENT) / PERCENT_DENOMINATOR;
```

or

```solidity
uint256 constant SPC_TO_ETH_CONVERSION = 5;
uint256 spcToTransfer = currentContributions[msg.sender] * SPC_TO_ETH_CONVERSION;
```

The above seems to be a common pattern in fee calculation. Admittedly, this is introducing additional run-time calcuation in a potentially high use function, however the solidity compile seems to handle this quite well: 49541 vs 49588 (A mere 47 gas difference).
Alternatively, a comment explicitly explaining that the statement amounts to a 2% transfer tax.

## **[Q-4]** TODO statement present at the very top of published code.

On line 13 in SpaceCoinICO.sol has the following code:

```
  // todo: reorder these things for better slot utilization
```

As we all know contracts are immutable on the blockchain. Anyone inspecting contract code will read this statement at the top. This statement can suggest that the deployer has published something unfinished, and therefore reduce trust. While this is a very harmless statement (and slot utilization seems to be pretty good), I think this can have some serious implications.

## **[Q-5]** Change public functions to external

In SpaceCoinICO.sol, `advance()`, `setPausedState()`, `removeSeedInvestors()` and `addSeedInvestors()` all are public functions that are not used within the contract.

Consider changing them to `external`. In certain instances, [this can save some gas](https://ethereum.stackexchange.com/questions/19380/external-vs-public-best-practices).

## **[Q-5]** Reentrancy guarding done manually

SpaceCoinICO.sol line 58 has the following

```
modifier contributeNotInProgress {
    require(contributionLock == false, "SpaceCoinICO.sol: CANNOT_REENTER");
    _;
}
```

This uses a similar pattern to OZ's `nonReentrant` modifier in which a mutex is used to prevent reentrancy. However, the handling of the mutex is done manually, and can be error prone.

For instance the `contibute()` function line 122 looks like this:

```
  function contribute() external contributeNotInProgress payable {
    _checkValidityOfContribution();
    contributionLock = true;
    ...
    if(phase == Phase.SEED || phase == Phase.GENERAL) {
        ...
        contibutionLock = false;
    }
    ...
    contributionLock = false;
  }
```

Consider: let the `modifier` do the work for you. Like the following:

```
modifier contributeNotInProgress {
    require(contributionLock == false, "SpaceCoinICO.sol: CANNOT_REENTER");
    contibutionLock = true;
    _;
    contibutionLock = false;
}

```

## **[Q-6]** ICO refunds difference when contribution reaches over limits. Possible derivation from spec (?)

In line 164 of SpaceCoinICO.sol we have the following:

```
if(refundAdjustedByIndividualLimit > 0) {
  (bool success, ) = msg.sender.call{value: refundAdjustedByIndividualLimit}("");
  require(success, "SpaceCoinICO.sol: REFUND_CALL_FAILED");
}
```

Which is (possibly) a derivation from the spec. Consider removing refund logic to significanly simplify the code and the number of calls the contract can make, reducing overall attack surface.

## **[Q-7]** Unused storage variables

Line 37, SpaceCoinICO.sol

```
bool public isCoinDeployed;
```

Is unused. Consider removing it.
