// How to run the script: npx hardhat run ./hardhat/script/claimHathorTransaction.js --network mumbai
const hre = require('hardhat');

async function main() {
    const {getNamedAccounts, deployments} = hre;
    // let {deployer} = await getNamedAccounts();    
    let deployer = '0xE23d59ef0c1F63B53234b00a1e1EaBEf822397D2';
    // console.log(deployer);
    
    const Bridge = await deployments.get('Bridge');
    const BridgeProxy = await deployments.get('BridgeProxy');
    const bridge = new web3.eth.Contract(Bridge.abi, BridgeProxy.address)

    const claim = {
        to: '0xE23d59ef0c1F63B53234b00a1e1EaBEf822397D2',
		amount: '10000000000000000',
		blockHash: '0x4682bcf4371729e37b229e29674d75afafa95677f994c2787ffb30eb6ec12d16',
		transactionHash: '0x8f04d52f3b6b4c28d025aae10bd34af9579c7414db72aa2779cb2447ec89036c',
		logIndex: 129,
		originChainId: 31,
    }

    const receipt = await bridge.methods
        .claim(claim).send({ from: deployer, gasLimit: 3000000 });

    console.log("Tokens claimed, txHash: ", receipt.transactionHash);
}

main()
    .then(() => process.exit(0))
    .catch((error) =>{
        console.error(error);
        process.exit(1)
    });