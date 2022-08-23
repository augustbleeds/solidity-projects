//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

/// @title the marketplace interface
interface NftMarketplace {
    function getPrice(address nftContract, uint nftId) external returns (uint price);
    function buy(address nftContract, uint nftId) external payable returns (bool success);
}

/// @title the different status conditions of a proposal
enum Status {
  /// @notice this means that votes are still being collected for the proposal  
  ACTIVE,
  /// @notice the only way a proposal can be cancelled is through another proposal!
  CANCELLED,
  /// @notice at this stage, you may still be unable to execute the proposal if minExecutionLag has not passed    
  VOTE_PASSED,
  /// @notice this could be due to lack of quorum or lack of enough "for" votes  
  VOTE_FAILED,
  EXECUTED
}

/// @title struct to store proposal data
/// @notice once a a proposal is passed, there is no expiration date on its execution (although there is a start date)
struct Proposal {
  uint256 id;
  uint256 forVotes;
  uint256 abstainVotes;
  uint256 againstVotes;
  address proposer;
  /// @notice the timestamp in which voting ends
  uint256 voteEnd;
  /// @notice the minimum amount of time a proposal has after voting ends before it can be executed
  uint256 minExecutionLag;
  string description;
  bool cancelled;
  bool executed;
  /// @notice to check if proposal was created or not
  bool created;
  mapping(address => bool) hasVoted;
}

contract CollectorDAO {

  string public constant name = "CollectorDAOByAugust";

  /// @notice The EIP-712 typehash for the contract's domain
  bytes32 public constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

  /// @notice The EIP-712 typehash for the delegation struct used by the contract
  bytes32 public constant CAST_VOTE_TYPEHASH = keccak256("CastVote(uint256 proposalId,uint8 support)");

  uint8 public constant AGAINST = 0;
  uint8 public constant FOR = 1;
  uint8 public constant ABSTAIN = 2;

  uint256 public constant REGISTRATION_FEE = 1 ether;

  /**
  * @notice once this event is emitted for a proposal, it signifies it cannot be executed again
  * @param success: whether or not the external function was successful
  */
  event ProposalExecuted(uint256 proposalId, bool success);

  event ProposalCreated(
    address proposer,
    uint256 proposalId, 
    address[] targets, 
    uint256[] values, 
    bytes[] calldatas, 
    string description, 
    uint256 voteDuration, 
    uint256 minExecutionLag
  );

  event ProposalCancelled(uint256 proposalId);

  /**
  * @notice once this event is emitted for a proposal, it signifies it cannot be executed again
  * @param bidSuccess: whether or not the bid/buy was successful
  */
  event NFTBid(uint256 nftId, uint256 price, bool bidSuccess);

  NftMarketplace public market;

  constructor(address _market) {
    market = NftMarketplace(_market);
  }

  mapping(address => bool) public isMember;
  uint256 totalMembers;

  mapping(uint256 => Proposal) public proposals;

  function hashProposal(
      address[] memory targets,
      uint256[] memory values,
      bytes[] memory calldatas,
      bytes32 descriptionHash
  ) public pure returns (uint256) {
      return uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash)));
  }

  function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4) {
    return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
  }

  /**
  * @notice allows anyone to buy a membership for 1 ETH
  */
  function buyMembership() external payable {
    require(msg.value == REGISTRATION_FEE && isMember[msg.sender] == false, "REGISTRATION_FAILED");
    isMember[msg.sender] = true;
    totalMembers++;
  }

  /**
      @notice allows anyone to get the status of a proposal id
   */
  function status(uint256 proposalId) public view returns(Status){
    require(proposals[proposalId].created, "PROPOSAL_NOT_FOUND");

    Proposal storage current = proposals[proposalId];

    if(current.cancelled) {
      return Status.CANCELLED;
    } else if(current.executed) {
      return Status.EXECUTED;
    } else if(block.timestamp <= current.voteEnd) {
      return Status.ACTIVE;
    }

    uint256 totalVotes = current.forVotes + current.abstainVotes + current.againstVotes;
    if(totalVotes < quorum() || current.againstVotes >= current.forVotes) {
      return Status.VOTE_FAILED;
    }

    return Status.VOTE_PASSED;

  }

  function quorum() view internal returns(uint256) {
    if(totalMembers >= 4) {
      uint256 min = totalMembers / 4;
      if(totalMembers % 4 == 0) {
        return min;
      } else {
        return min + 1;
      }
    } else if(totalMembers == 1) {
      return totalMembers;
    } else {
      // triggered when totalMembers is 2 or 3
      return totalMembers - 1; 
    } 
  }

  /**
    @notice allows anyone to propose any EVM call for dao to execute
    @param voteDuration: The duration for which voting is open
    @param minExecutionLag: The minimum amount of time before the proposal can be executed after voting ends
   */
  function propose(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description, uint256 voteDuration, 
  uint256 minExecutionLag) external onlyMember {
    require(targets.length == values.length && values.length == calldatas.length, "INVALID_ARGUMENT");
    uint256 _proposalId = hashProposal(targets, values, calldatas, keccak256(bytes(description)));
    require(proposals[_proposalId].created == false, "ALREADY_EXISTS");

    Proposal storage newProposal = proposals[_proposalId];
    newProposal.id = _proposalId;
    newProposal.proposer = msg.sender;
    newProposal.voteEnd = block.timestamp + voteDuration;
    newProposal.minExecutionLag = minExecutionLag;
    newProposal.description = description;
    newProposal.created = true;

    emit ProposalCreated(msg.sender, _proposalId, targets, values, calldatas, description, voteDuration, minExecutionLag);
  }

  /// @notice we trust buy nft so we do not check for re-entrancy vulnerability
  function buyNFT(uint256 maxBuyPrice, address nftContract, uint256 nftId) external onlyDao returns(bool){
    require(address(this).balance >= maxBuyPrice && maxBuyPrice >= market.getPrice(nftContract, nftId), "INSUFFICIENT_FUNDS");
    bool success = market.buy{value: maxBuyPrice}(nftContract, nftId);
    // if buy() reverts, no event will be emitted
    emit NFTBid(nftId, maxBuyPrice, success);
    return success;
  }

  function execute(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) external {
    require(targets.length == values.length && values.length == calldatas.length, "INVALID_ARGUMENT");
    uint256 id = hashProposal(targets, values, calldatas, keccak256(bytes(description)));
    require(status(id) == Status.VOTE_PASSED && block.timestamp > proposals[id].voteEnd + proposals[id].minExecutionLag, "EXECUTION_REFUSED");
    proposals[id].executed = true;

    bool result = true;
    for(uint256 i = 0 ; i < targets.length ; i ++) {
     (bool success, ) = targets[i].call{value: values[i]}(calldatas[i]);
     result = result && success;
    }

    emit ProposalExecuted(id, result);
  }

  function isVoteValid(uint256 proposalId, uint8 support, address member) internal view {
    require(isMember[member] && !proposals[proposalId].hasVoted[member] && status(proposalId) == Status.ACTIVE && support <= ABSTAIN, "VOTE_NOT_ACCEPTED");
  }

  // @notice support 0, 1, 2 mean against, for, and abstain respectively
  function castVote(uint256 proposalId, uint8 support) public onlyMember {
    _vote(proposalId, support, msg.sender);
  }

  function _vote(uint256 proposalId, uint8 support, address member) internal {
    isVoteValid(proposalId, support, member);

    Proposal storage currentProposal = proposals[proposalId];
    if(support == ABSTAIN) {
      currentProposal.abstainVotes++;
    } else if(support == FOR) {
      currentProposal.forVotes++;
    } else {
      currentProposal.againstVotes++;
    }

    currentProposal.hasVoted[member] = true;

  }

  /// @notice non-members will be able to call this function and to tally votes from real members
  /// @param voter: the voter who signed the signature. used to make sure signer isn't a random address
  function castVoteBySig(address voter, uint256 proposalId, uint8 support, uint8 v, bytes32 r, bytes32 s) public {
    bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes("1")), block.chainid, address(this)));
    bytes32 structHash = keccak256(abi.encode(CAST_VOTE_TYPEHASH, proposalId, support));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    address signer = ecrecover(digest, v, r, s);
    require(signer != address(0) && signer == voter, "INVALID_SIGNATURE");
    _vote(proposalId, support, signer);

  }

  function castVoteBySigBulk(address[] memory voters, uint256[] memory proposalIds, uint8[] memory support, uint8[] memory v, bytes32[] memory r, bytes32[] memory s) public {
    require(v.length == voters.length && v.length == proposalIds.length && v.length == support.length && v.length == r.length && v.length == s.length, "INVALID_ARGUMENT");
    for(uint256 i = 0 ; i < v.length ; i++) {
      castVoteBySig(voters[i], proposalIds[i], support[i], v[i], r[i], s[i]);
    }
  }

  /// @notice this can only be called by the dao via a proposal!
  function cancelProposal(uint256 proposalId) external onlyDao {
    require(status(proposalId) == Status.VOTE_PASSED, "CANT_CANCEL");
    proposals[proposalId].cancelled = true;
    emit ProposalCancelled(proposalId);
  }

  modifier onlyMember {
    require(isMember[msg.sender], "ONLY_MEMBER");
    _;
  }

  modifier onlyDao {
  require(msg.sender == address(this), "ONLY_DAO");
  _;
}



}