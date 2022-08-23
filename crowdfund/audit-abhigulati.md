

## ** [L-1] ** Attacker may be able to mint excessive NFTs
Note: I think your contract may actually be safe from this vulnerability. Had you used a regular number and done something like `_safeMint(msg.sender, newTokenId++);`, I think you would have been susceptible. Essentially, the vulnerability is that I can set up a contract to send a large contribution, and then send a small contribution in its `onERC721Received` method. The counters in your code will be off, and you'll try to grant too many NFTs. 

This is the section that introduces the risk
```
contributions[msg.sender] += msg.value;  
currentFundAmount += msg.value;  
maxFundAmountReached = currentFundAmount;   // since contributions can only increase the funding amount we have a new maximum  
  
uint256 contributionsTruncate  = uint256(contributions[msg.sender]) / uint256(1 ether);  
uint256 tokensOwed = contributionsTruncate - balanceOf(msg.sender);
```

and this is the contract I set up to attack yours (it fails, will discuss why after)
```
contract Attacker is IERC721Receiver {  
    address projectAddress;  
    constructor(address _projectAddress) {  
        projectAddress = _projectAddress;  
    }  
  
    function contributeToProject() external payable {  
        Project project = Project(projectAddress);  
  
        if (msg.value > 2 ether) {  
            project.contribute{value : 2 ether}();  
        } else {  
            project.contribute{value : msg.value}();  
        }  
    }  
  
    function onERC721Received(  
        address operator,  
        address from,  
        uint256 tokenId,  
        bytes calldata data  
    ) external returns (bytes4) {  
        Project project = Project(projectAddress);  
  
        if (address(this).balance > .01 ether) {  
            project.contribute{value: .01 ether}();  
        }  
  
        return IERC721Receiver.onERC721Received.selector;  
    }  
}
```

Imagine that my EOA calls `Attacker.contributeToProject` with 4 ETH. `Attacker` will then contribute 3 ETH to your contract. Let's look at the values in that block of code:


```
require(status() == ProjectState.ACTIVE, "You cannot contribute because project is no longer active");  // This passes (I set goal to 8 ETH)
require(msg.value >= 0.01 ether, "Project contribution must be at least 0.01 ETH");  // This passes (Attacker contributes .01 ETH)
contributions[msg.sender] += msg.value; // This will now be 3 ETH 
  
uint256 contributionsTruncate  = uint256(contributions[msg.sender]) / uint256(1 ether);  // This will be 3
uint256 tokensOwed = contributionsTruncate - balanceOf(msg.sender); // This will also be 3
```

Your contract will mint tokenId=0 for the Attacker contract, which triggers the `onERC721Received` method which causes the `Attacker` contact to contribute 0.01 ETH to your contract. Now we have a nested call into your contract - a second call to `contribute` from within the same transaction. 

Let's look through the block of code again, with labels on the value of each expression
```
require(status() == ProjectState.ACTIVE, "You cannot contribute because project is no longer active");  // This passes (I set goal to 8 ETH)
require(msg.value >= 0.01 ether, "Project contribution must be at least 0.01 ETH");  // This passes (Attacker contributes .01 ETH)
contributions[msg.sender] += msg.value; // This will now be 3.01 ETH 
  
uint256 contributionsTruncate  = uint256(contributions[msg.sender]) / uint256(1 ether);  // This will be 3 again
uint256 tokensOwed = contributionsTruncate - balanceOf(msg.sender); // This will be 2 - only 1 has been minted so far
```
This nested call will try to mint 2 NFTs to Attacker, and the outer call is still going to mint 3 (total). This would give 5 total, even though only 3 have been earned.

The reason this attack fails is that in the nested call, your contract has not yet updated the `tokenId` counter, and so it will try to mint `tokenId=0` in the nested call, which fails and reverts the transaction.


## ** [L-2] ** Force-sent contributions cannot be recovered
I think, since you don't have a `receive payable` function, this is pretty low risk. Apparently someone can you send your contract ETH by `selfdestruct`ing a contract, but probably an obscure scenario.

Since you're tracking `currentFundAmount` variable (rather than just using the balance of the contract), if someone were to somehow pass value to the contract without calling `contribute`, that value would become locked forever, and even the creator would not have access.

One way to fix would be to limit the creator's withdrawals to `address(this).balance` instead of maintaining tracking in storage. This would also give some gas savings.

### Nits
1. `returns` variable unused

On line 29, you have: `function status() public view returns(ProjectState currentStatus) {`
I think it's more conventional to just do `returns(ProjectState)` here. If you're going to name the variable, then instead of `return ProjectState.FAILURE;` you could do `currentStatus = ProjectState.FAILURE;` but this is pretty non-standard, probably best to just stick with `return`s.

2. slightly opaque that `status()` always returns a value

If I make the change suggested above (change the return to `returns(ProjectState)`), my IDE warns that there is "no return statement" - presumably what it means is that it can't tell whether you're always returning something from your function.

These two blocks would be clearer as an `if/else`, since the two conditionals are opposite each other. If I make this change, the IDE no longer has the warning about no return value.
```
if(block.timestamp > createdDate + 30 days) {  
    return ProjectState.FAILURE;  
}  
  
if (block.timestamp <= createdDate + 30 days) {  
    return ProjectState.ACTIVE;  
}
```


3. The outer `if` here is redundant/unnecessary.

If `tokensOwed <= 0`, the `for` loop won't do anything. There's probably some small gas savings at deployment from removing the `if`; there may also be some gas savings during transaction if the `if` is kept; I doubt it, but if so, there's a tradeoff to consider and maybe it's worth keeping.

```
if(tokensOwed > 0) {  
    for(uint256 i = 0; i < tokensOwed ; i++) {  
        uint256 newTokenId = _tokenIds.current();  
        _safeMint(msg.sender, newTokenId);  
        _tokenIds.increment();  
    }  
}
```


4. Save `endDate` in storage instead of `createdDate`

The `createdDate` value is only used as part of this calculation: `createdDate + 30 days`, which will be called every time we check the project status. We could instead compute that result once and put it in storage to save future gas costs.