// How to run the script: npx hardhat run ./hardhat/script/voteHathorTransaction.js --network mumbai
const hre = require('hardhat');

async function main() {
    const {getNamedAccounts, deployments} = hre;
    let {deployer} = await getNamedAccounts();
    // console.log(deployer);

    const Token = await deployments.get('MainToken');

    const Federation = await deployments.get('Federation');
    const FederationProxy = await deployments.get('FederationProxy');
    const federation = new web3.eth.Contract(Federation.abi, FederationProxy.address)
      
    const receipt = await federation.methods
        .voteTransaction( 
        Token.address,
		'0x16795bf23015b2434c1831d94bab4f2436eeb03e',
		'0xCC3CF44397Daa4572CDb20f72dee5700507454E4',
		'4000000000000000000',
		'0x0d768b8e1e1597dffc5ab49384f89ae12f503d6716c2947e81befcbe96a12ddf',
		'0x764feab73b3331ac2472b821ab344dee6d3c7273b65d5240503041a4193fd7b8',
		129,
		31,
		80001
        ).send({ from: deployer, gasLimit: 3000000 });

    console.log("Tokens sent, txHash: ", receipt.transactionHash);
}

main()
    .then(() => process.exit(0))
    .catch((error) =>{
        console.error(error);
        process.exit(1)
    });