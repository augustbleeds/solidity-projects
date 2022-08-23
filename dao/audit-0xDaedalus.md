# DAO Peer Micro Audit.


## **[L-1]** Possibility of inconsistent proposal execution.

On line 195, CollectorDAO.sol has the following code:

    bool result = true;
    for(uint256 i = 0 ; i < targets.length ; i ++) {
     (bool success, ) = targets[i].call{value: values[i]}(calldatas[i]);
     result = result && success;
    }

With this pattern - its possible that a proposal consisting of multiple calls has one of the calls fail and other others still execute.  For example if there is a proposal to 1. Supply ETH to a lending protocol 2. use that ETH as collateral to takeout aloan - if 2 fails for whatever reason - the CollectorDAO has now supplied ETH to a contract and gotten nothing in return until they submit another proposal.  If the contract is malicious (for example only allows supplying but not withdrawing) then another proposal won't help and the ETH is lost forever.  

Consider: having proposal execution be "all or nothing".

## **[Q-1]** Constants that could be an enum.

On line 53-55, CollectorDAO.sol has the following code:

  uint8 public constant AGAINST = 0;
  uint8 public constant FOR = 1;
  uint8 public constant ABSTAIN = 2;

This defines three variables - when you could define these as a struct instead (and get the typesafety of having a struct).

Consider: Using a struct instead of 3 constant uints.

## **[Q-2]** Quorum is incorrect if there are 3 members.

On line 153, CollectorDAO.sol has the following code:

      // triggered when totalMembers is 2 or 3
      return totalMembers - 1; 

When there are 3 members in the DAO - quorum() will return `2` (66%) when it should return `1` (33%).

Consider: separating out the logic for handling `2` and `3` total members.