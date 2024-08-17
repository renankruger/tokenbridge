// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v2;

// Upgradables
import "../zeppelin/upgradable/Initializable.sol";
import "../zeppelin/upgradable/ownership/UpgradableOwnable.sol";

contract HathorTransactions is Initializable, UpgradableOwnable {
    address private constant NULL_ADDRESS = address(0);
    uint public constant MAX_MEMBER_COUNT = 50;

    address[] public members;

    struct Signatures {      
        bytes signature;
    }

    /**
	@notice All the addresses that are members of the federation
	@dev The address should be a member to vote in transactions
	*/

    mapping(address => bool) public isMember;

    mapping(bytes32 => mapping(address => bool)) public isSigned;
    mapping(bytes32 => bool) public isProcessed;
    mapping (bytes32 => bool) public isProposed;
    mapping (bytes32 => bytes) public transactionHex;
    mapping (bytes32 => Signatures[] ) public transactionSignatures;


    enum Flow {
        MELT,
        MINT,
        TRNASFER,
        RETURN
    }

    modifier onlyMember() {
        require(isMember[_msgSender()], "Federation: Not Federator");
        _;
    }

    event ProposalSigned(
        bytes32 indexed transactionId,
        address indexed member,
        bool signed,
        bytes signature
    );

    event ProposalSent(bytes32 indexed transactionId,  bytes32 originalTransactionHash ,bool processed);
    event TransactionProposed(bytes32 transactionId, bytes txHex);


    event MemberAddition(address indexed member);
    event MemberRemoval(address indexed member);

    function initialize(
        address[] calldata _members,
        address owner
    ) public initializer {
        UpgradableOwnable.initialize(owner);
        require(
            _members.length <= MAX_MEMBER_COUNT,
            "Federation: Too many members"
        );
        members = _members;
        for (uint i = 0; i < _members.length; i++) {
            require(
                !isMember[_members[i]] && _members[i] != NULL_ADDRESS,
                "Federation: Invalid members"
            );
            isMember[_members[i]] = true;
            emit MemberAddition(_members[i]);
        }
    }


    function getTransactionId(
        bytes32 originalTokenAddress,
        bytes32 transactionHash,
        uint256 value,
        bytes32 sender,
        bytes32 receiver,
        Flow flow       
    ) external onlyMember  returns(bytes32){

        bytes32 transactionId = keccak256(
            abi.encodePacked(
                originalTokenAddress,
                sender,
                receiver,
                value,
                transactionHash,
                flow
            )
        );

        return transactionId;
    }


    function sendTransactionProposal( bytes32 originalTokenAddress,
        bytes32 transactionHash,
        uint256 value,
        bytes32 sender,
        bytes32 receiver,
        Flow flow,
        bytes memory txHex) external onlyMember{
       

        bytes32 transactionId = keccak256(
            abi.encodePacked(
                originalTokenAddress,
                sender,
                receiver,
                value,
                transactionHash,
                flow
            )
        );

        require(isProposed[transactionId] == false, "HathorTransactions: already proposed");
        transactionHex[transactionId] = txHex;
        isProposed[transactionId] = true;
        emit TransactionProposed(transactionId, transactionHash, txHex);
    }


    function updateSignatureState(
        bytes32 originalTokenAddress,
        bytes32 transactionHash,
        uint256 value,
        bytes32 sender,
        bytes32 receiver,
        Flow flow,
        bytes memory signature,
        bool signed
    ) external onlyMember {
        bytes32 transactionId = keccak256(
            abi.encodePacked(
                originalTokenAddress,
                sender,
                receiver,
                value,
                transactionHash,
                flow
            )
        );

        require(
            isSigned[transactionId][_msgSender()] == false,
            "HathorTransactions: Transaction already signed"
        );

        isSigned[transactionId][_msgSender()] = signed;
        transactionSignatures[transactionId].push(Signatures(signature));

        emit ProposalSigned(transactionId, _msgSender(), signed, signature);
    }

    function updateTransactionState(
        bytes32 originalTokenAddress,
        bytes32 transactionHash,
        uint256 value,
        bytes32 sender,
        bytes32 receiver,
        Flow flow,
        bool sent
    ) external onlyMember {
        bytes32 transactionId = keccak256(
            abi.encodePacked(
                originalTokenAddress,
                sender,
                receiver,
                value,
                transactionHash,
                flow
            )
        );
        require(
            isProcessed[transactionId] == false,
            "HathorTransactions: Transaction already sent"
        );
        isProcessed[transactionId] = sent;
        emit ProposalSent(transactionId, sent);
    }

    function addMember(address _newMember) external onlyOwner {
        require(_newMember != NULL_ADDRESS, "Federation: Empty member");
        require(!isMember[_newMember], "Federation: Member already exists");

        isMember[_newMember] = true;
        members.push(_newMember);
        emit MemberAddition(_newMember);
    }

    function removeMember(address _oldMember) external onlyOwner {
        require(_oldMember != NULL_ADDRESS, "Federation: Empty member");
        require(isMember[_oldMember], "Federation: Member doesn't exists");
        require(members.length > 1, "Federation: Can't remove all the members");

        isMember[_oldMember] = false;
        for (uint i = 0; i < members.length - 1; i++) {
            if (members[i] == _oldMember) {
                members[i] = members[members.length - 1];
                break;
            }
        }
        members.pop(); // remove an element from the end of the array.
        emit MemberRemoval(_oldMember);
    }

    /**
		@notice Return all the current members of the federation
		@return Current members
		*/
    function getMembers() external view returns (address[] memory) {
        return members;
    }
}
