// How to run the script: npx hardhat run ./hardhat/script/sendSignature.js --network sepolia
const hre = require('hardhat');
const abi = require('../../../federator/src/contracts/HathorFederation.json')

async function main() {
    const {getNamedAccounts} = hre;
    const {deployer} = await getNamedAccounts();       
    const bridge = new web3.eth.Contract(abi, "0x6f6371add1e3a60726c426667f9f463e71cc3a13")
    
    // const receipt = await bridge.methods
    //     .updateSignatureState(
    //     "0x00000000000000000000000076c6af5A264A4fA4360432e365F5A80503476415",
    //     "0x2336a2c4c79a4343392233ea209fede3c48c8531a6d6af5975c6363c4559d38a",
    //     "1000000000000000000",
    //     "0xCC3CF44397Daa4572CDb20f72dee5700507454E4",
    //     "WjDz74uofMpF87xy9F9F1HYs9rjU6vY8Gr",
    //     1,
    //     "03540e9ab3a4827f3110fe795308c2989055edc519840294a067f01e9652d70efe|0:3045022100d1faae47d7b105b7e8ab223715841d71c761ae85470ca74b93be1b3da39cc45f022008a8c7f001dc19728630af4de25dda8400666d0ba94781859f1ffdc1289cf84b|1:3045022100a1e9690e7b86fbca6088553f31e24e0652e97cb6c2a5a5bdfe7625271fa331110220541eb1cf9816c0ef34bfa6e4160eff48a73752efaf6b8df3c4689d276358017e",
    //     "true"
    // ).send({ from: deployer, gasLimit: 3000000 });

        const txId = await bridge.methods.getTransactionId(
            "0x00000000000000000000000076c6af5A264A4fA4360432e365F5A80503476415",
            "0x2336a2c4c79a4343392233ea209fede3c48c8531a6d6af5975c6363c4559d38a",
            "1000000000000000000",
            "0xCC3CF44397Daa4572CDb20f72dee5700507454E4",
            "WjDz74uofMpF87xy9F9F1HYs9rjU6vY8Gr",
            1
        ).call();

        console.log(txId);

    //     const receipt = await bridge.methods
    //     .setSignatureFailed(
    //         txId,
    //         "0xCC3CF44397Daa4572CDb20f72dee5700507454E4",
    //     ).send({ from: deployer, gasLimit: 3000000 });

    // console.log("Tokens sent, txHash: ", receipt.transactionHash);
}

main()
    .then(() => process.exit(0))
    .catch((error) =>{
        console.error(error);
        process.exit(1)
    });