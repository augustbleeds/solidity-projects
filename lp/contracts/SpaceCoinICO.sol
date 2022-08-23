//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;
import "./SpaceCoin.sol";

enum Phase {
    SEED,
    GENERAL,
    OPEN
}

contract SpaceCoinICO {
    // todo: reorder these things for better slot utilization

    uint256 public constant SEED_INDIVIDUAL_LIMIT = 1500 ether;
    uint256 public constant SEED_FUND_LIMIT = 15000 ether;
    uint256 public constant FUND_LIMIT = 30000 ether;
    uint256 public constant GENERAL_INDIVIDUAL_LIMIT = 1000 ether;
    // how many eth hasn't the user cashed out yet for SPC tokens
    mapping(address => uint256) public currentContributions;
    // how many purchases in eth (redeemed or unredeemed) this user has made
    mapping(address => uint256) public purchased;

    // to prevent re-entrancy into the contribution() function
    bool private contributionLock;

    // the maximum the fund reached
    uint256 public fundMax;
    uint256 public currentFund;

    Phase public phase;
    SpaceCoin public spaceCoin;
    address public owner;
    address public treasury;
    bool public isPaused;
    bool public isCoinDeployed;

    mapping(address => bool) public isSeedInvestor;

    event SpaceCoinDeployed(address coin);
    event PhaseAdvance(Phase advancedTo);
    event Contribute(
        address investor,
        uint256 totalContribution,
        uint256 lastContribution,
        bool individualLimitReached,
        bool fundLimitReached
    );
    event Redeem(address investor, uint256 amountOfSPC);

    error SeedInvestorAddedAlready(address investor);
    error NoInvestorExists(address investor);
    error FundingRoundFilled(address investor, Phase phase);
    error MaxIndividualContributionFilled(address investor);

    modifier onlyOwner() {
        require(msg.sender == owner, "SpaceCoinICO.sol: MUST_BE_OWNER");
        _;
    }

    modifier contributeNotInProgress() {
        require(contributionLock == false, "SpaceCoinICO.sol: CANNOT_REENTER");
        _;
    }

    constructor(address _treasury) {
        owner = msg.sender;
        treasury = _treasury;
        deployCoin();
    }

    // let the ICO contract create the coin to prevent user error from setting address
    function deployCoin() internal {
        spaceCoin = new SpaceCoin(treasury);
        emit SpaceCoinDeployed(address(spaceCoin));
    }

    function redeem() public contributeNotInProgress {
        _redeem();
    }

    function _redeem() internal {
        require(phase == Phase.OPEN, "SpaceCoinICO.sol: MUST_BE_PHASE_OPEN");
        require(
            currentContributions[msg.sender] > 0,
            "SpaceCoinICO.sol: MUST_HAVE_CONTRIBUTIONS"
        );
        uint256 spcToTransfer = currentContributions[msg.sender] * 5;
        currentContributions[msg.sender] = 0;
        bool success = spaceCoin.transfer(msg.sender, spcToTransfer);
        require(success, "SpaceCoinICO.sol: ERC20_TRANSFER_CALL_FAILED");
        emit Redeem(msg.sender, spcToTransfer);
    }

    function _checkValidityOfContribution() internal view {
        require(msg.value > 0, "SpaceCoinICO.sol: NO_MONEY_SENT");
        require(!isPaused, "SpaceCoinICO.sol: FUNDING_MUST_BE_UNPAUSED");

        // preliminary checks for reverting
        if (phase == Phase.SEED) {
            // fundLimit = SEED_FUND_LIMIT;

            if (currentFund >= SEED_FUND_LIMIT) {
                revert FundingRoundFilled(msg.sender, phase);
            }

            require(
                isSeedInvestor[msg.sender],
                "SpaceCoinICO.sol: SEED_PHASE_INVESTORS_ONLY"
            );

            if (currentContributions[msg.sender] == SEED_INDIVIDUAL_LIMIT) {
                revert MaxIndividualContributionFilled(msg.sender);
            }

            // if assert occurs, somehow seed investor was able to exceed contribution limit. This is very wrong!
            assert(currentContributions[msg.sender] <= SEED_INDIVIDUAL_LIMIT);
        } else if (phase == Phase.GENERAL) {
            if (currentContributions[msg.sender] >= GENERAL_INDIVIDUAL_LIMIT) {
                revert MaxIndividualContributionFilled(msg.sender);
            }
        }

        if (
            (phase == Phase.GENERAL || phase == Phase.OPEN) &&
            fundMax >= FUND_LIMIT
        ) {
            revert FundingRoundFilled(msg.sender, phase);
        }
    }

    function contribute() external payable contributeNotInProgress {
        _checkValidityOfContribution();
        contributionLock = true;

        uint256 fundLimit = FUND_LIMIT;

        if (phase == Phase.SEED) {
            fundLimit = SEED_FUND_LIMIT;
        }

        // at this point, we know for sure that there is still space left in the current funding round
        // our contribution is restricted by whichever limit (individual or fund) is triggered first
        // so we compare the two here and choose the most restrictive contribution

        uint256 actualContributionAdjustedByIndividualLimit = msg.value;
        uint256 refundAdjustedByIndividualLimit = 0;

        uint256 actualContributionAdjustedByFundLimit = msg.value;
        uint256 refundAdjustedByFundLimit = 0;

        // calculate adjusted contribution value towards but not in excess of funding limit
        if (msg.value + currentFund > fundLimit) {
            actualContributionAdjustedByFundLimit = fundLimit - currentFund;
            refundAdjustedByFundLimit =
                msg.value -
                actualContributionAdjustedByFundLimit;
        }

        // calculate adjusted contribution value towards but not in excess of individual limit
        // note that the individual limit only applies during the seed or general phase
        if (phase == Phase.SEED || phase == Phase.GENERAL) {
            uint256 individualLimit = phase == Phase.SEED
                ? SEED_INDIVIDUAL_LIMIT
                : GENERAL_INDIVIDUAL_LIMIT;
            if (
                msg.value + currentContributions[msg.sender] > individualLimit
            ) {
                actualContributionAdjustedByIndividualLimit =
                    individualLimit -
                    currentContributions[msg.sender];
                refundAdjustedByIndividualLimit =
                    msg.value -
                    actualContributionAdjustedByIndividualLimit;
            }

            // if the individual limit is triggered first, both are triggered at the same time, or neither is triggered
            if (
                actualContributionAdjustedByIndividualLimit <=
                actualContributionAdjustedByFundLimit
            ) {
                currentContributions[
                    msg.sender
                ] += actualContributionAdjustedByIndividualLimit;
                purchased[
                    msg.sender
                ] += actualContributionAdjustedByIndividualLimit;
                fundMax += actualContributionAdjustedByIndividualLimit;
                currentFund += actualContributionAdjustedByIndividualLimit;

                if (refundAdjustedByIndividualLimit > 0) {
                    (bool success, ) = msg.sender.call{
                        value: refundAdjustedByIndividualLimit
                    }("");
                    require(success, "SpaceCoinICO.sol: REFUND_CALL_FAILED");
                }

                emit Contribute(
                    msg.sender,
                    currentContributions[msg.sender],
                    actualContributionAdjustedByIndividualLimit,
                    currentContributions[msg.sender] == individualLimit,
                    currentFund == fundLimit
                );

                contributionLock = false;
                return;
            }
        }

        // this is the case in which the fund limit is more restritive
        // note there is always a fund limit at all phases
        currentContributions[
            msg.sender
        ] += actualContributionAdjustedByFundLimit;
        purchased[msg.sender] += actualContributionAdjustedByFundLimit;
        fundMax += actualContributionAdjustedByFundLimit;
        currentFund += actualContributionAdjustedByFundLimit;

        if (refundAdjustedByFundLimit > 0) {
            (bool success, ) = msg.sender.call{
                value: refundAdjustedByFundLimit
            }("");
            require(success, "SpaceCoinICO.sol: REFUND_CALL_FAILED");
        }

        emit Contribute(
            msg.sender,
            currentContributions[msg.sender],
            actualContributionAdjustedByFundLimit,
            false,
            currentFund == fundLimit
        );

        // user can only redeem after the contribution event has been emitted
        if (phase == Phase.OPEN) {
            _redeem();
        }
        contributionLock = false;
    }

    function addSeedInvestors(address[] memory investors)
        public
        onlyOwner
        contributeNotInProgress
    {
        for (uint256 i = 0; i < investors.length; i++) {
            if (!isSeedInvestor[investors[i]]) {
                isSeedInvestor[investors[i]] = true;
            } else {
                revert SeedInvestorAddedAlready(investors[i]);
            }
        }
    }

    function removeSeedInvestors(address[] memory investors)
        public
        onlyOwner
        contributeNotInProgress
    {
        for (uint256 i = 0; i < investors.length; i++) {
            if (isSeedInvestor[investors[i]]) {
                isSeedInvestor[investors[i]] = false;
            } else {
                revert NoInvestorExists(investors[i]);
            }
        }
    }

    function setPausedState(bool _newState)
        public
        onlyOwner
        contributeNotInProgress
    {
        // avoid unnecessary write to storage if possible
        if (isPaused != _newState) {
            isPaused = _newState;
        }
    }

    function advance(Phase expectedCurrent)
        external
        onlyOwner
        contributeNotInProgress
        returns (Phase)
    {
        require(phase == expectedCurrent, "INVALID_PHASE");
        phase = Phase(uint8(expectedCurrent) + 1);
        emit PhaseAdvance(phase);
    }

    function setTax(bool tax)
        external
        onlyOwner
        contributeNotInProgress
        returns (bool)
    {
        return spaceCoin.setTax(tax);
    }

    function withdraw(uint256 amount, address to)
        external
        contributeNotInProgress
    {
        require(
            msg.sender == treasury &&
                phase == Phase.OPEN &&
                amount <= currentFund,
            "CANNOT_WITHDRAW"
        );
        currentFund -= amount;
        (bool success, ) = to.call{value: amount}("");
        require(success, "WITHDRAW_FAILED");
    }
}
