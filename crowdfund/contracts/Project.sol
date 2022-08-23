//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

import "hardhat/console.sol";

contract Project is ERC721 {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // FAILURE state represents both project cancelled and project failure (unable to met goal)
    enum ProjectState { ACTIVE, SUCCESS, FAILURE } 

    uint256 createdDate;
    address public creator;
    uint256 public fundGoal;
    uint256 public maxFundAmountReached;
    uint256 public currentFundAmount;
    mapping(address => uint256) public contributions;
    bool private cancelled;

    event ProjectContribution(address contributor, uint256 amount); // Note: you should add additional data fields in this event
    event ProjectWithdrawal(uint256 amount);
    event ProjectRefund(address contributor, uint256 amount);
    event ProjectCancelled();

    function status() public view returns(ProjectState currentStatus) {
        if (maxFundAmountReached >= fundGoal) {
            return ProjectState.SUCCESS;
        } else { // fund goal has not been met
            if(cancelled) {
                return ProjectState.FAILURE;
            }
            
            if(block.timestamp > createdDate + 30 days) {
                return ProjectState.FAILURE;
            }
            
            if (block.timestamp <= createdDate + 30 days) {
                return ProjectState.ACTIVE;
            }
        } 
    }

    constructor(uint256 _fundGoal, address _creator, string memory _name, string memory _symbol) ERC721(_name, _symbol) {
        fundGoal = _fundGoal;
        creator = _creator;
        createdDate = block.timestamp;
    }


    function contribute() external payable {
        require(status() == ProjectState.ACTIVE, "You cannot contribute because project is no longer active");
        require(msg.value >= 0.01 ether, "Project contribution must be at least 0.01 ETH");
        contributions[msg.sender] += msg.value;
        currentFundAmount += msg.value;
        maxFundAmountReached = currentFundAmount;   // since contributions can only increase the funding amount we have a new maximum

        uint256 contributionsTruncate  = uint256(contributions[msg.sender]) / uint256(1 ether);
        uint256 tokensOwed = contributionsTruncate - balanceOf(msg.sender);

        // if assert occurs, somehow user was given more NFTs than they deserved based on their contributions. This is very wrong so we assert
        assert(tokensOwed >= 0);
        
        if(tokensOwed > 0) {
            for(uint256 i = 0; i < tokensOwed ; i++) {
                uint256 newTokenId = _tokenIds.current();
                _safeMint(msg.sender, newTokenId);
                _tokenIds.increment();
            }
        }
        
        emit ProjectContribution(msg.sender, msg.value);
    }

    function cancel() external {
        require(msg.sender == creator, "You are not a creator and cannot cancel the project");
        require(status() == ProjectState.ACTIVE, "Project must be active to be cancelled");
        cancelled = true;
        emit ProjectCancelled();
    }

    function refund() external {
        require(status() == ProjectState.FAILURE, "Project has not failed or been cancelled. You can't currently be refunded");
        uint256 refundAmount = contributions[msg.sender];

        // re-entrancy guard
        require(refundAmount > 0, "You have no outstanding credit and are not entitled to a refund");
        currentFundAmount -= refundAmount;
        contributions[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: refundAmount}("");
        require(success, "Transferring money failed");
        emit ProjectRefund(msg.sender, refundAmount);
    }

    function withdraw(uint256 amount) public {
        require(msg.sender == creator, "Only the creator can withdraw funds");

        if(status() == ProjectState.ACTIVE) {
            revert("Cannot withdraw funds while project is active");
        } else if(status() == ProjectState.SUCCESS) {
            require(amount <= currentFundAmount, "Withdrawal exceeds amount available");
            currentFundAmount -= amount;
            (bool success, ) = creator.call{value: amount}(""); // get return value
            require(success, "Transferring money failed");
            emit ProjectWithdrawal(amount);
        } else { // project status is a failure or it has been cancelled
            revert("You cannot withdraw from a failed or cancelled project!");
        }
}



}
