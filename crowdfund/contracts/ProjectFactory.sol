//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;
import "./Project.sol";

contract ProjectFactory {
    // TODO: add public array 
    Project[] public projects;

    // TODO: add index and owner
    event ProjectCreated(address newProject); // Note: you should add additional data fields in this event

    function create(uint256 _fundGoal, string memory _name, string memory _symbol) external {
        require(_fundGoal >= 0.01 ether, "Project goal must be >= 0.01 Ether");
        Project p = new Project(_fundGoal, msg.sender, _name, _symbol);
        projects.push(p);

        emit ProjectCreated(address(p)); // TODO: replace me with the actual Project's address
    }

    // return all the projects at once for convinience
    function allProjects() external view returns(Project[] memory) {
        return projects;
    }

}
