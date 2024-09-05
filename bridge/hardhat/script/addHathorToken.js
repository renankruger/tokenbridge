// How to run the script: npx hardhat run ./hardhat/script/addHathorToken.js --network mumbai
const hre = require("hardhat");

async function main() {
  const {getNamedAccounts, deployments} = hre;
  const {deployer} = await getNamedAccounts();
  const transactionEtherValue = 0;
  const mainToken = "0x0280f915ce595ec0d3457f89a0eba554999ec273";
  const hathorToken = "000001f8107c19b57397acb4d44d66208015b6c0eb6cbc3c46651c6fc1e43cdd";

  const Bridge = await deployments.get('Bridge');
  const BridgeProxy = await deployments.get('BridgeProxy');
  const MultiSigWallet = await deployments.get('MultiSigWallet');

  const bridge = new web3.eth.Contract(Bridge.abi, BridgeProxy.address);
  const multiSigContract = new web3.eth.Contract(MultiSigWallet.abi, MultiSigWallet.address);

  const methodCallAddHathorToken = await bridge.methods.addHathorToken(31, mainToken, hathorToken);
  const result = await methodCallAddHathorToken.call({ from: MultiSigWallet.address });
  console.log("Method call result", result);

  const receipt = await multiSigContract.methods.submitTransaction(
    BridgeProxy.address,
    transactionEtherValue,
    methodCallAddHathorToken.encodeABI()
  ).send({
    from: deployer,
    gasLimit: 3000000
  });

  console.log("Transaction worked, member added, txHash:", receipt.transactionHash);

  // const tx = await bridge.methods.uidToAddress(hathorToken).call({ from: deployer });
  // console.log(`uid mapped to ${tx}`);

  const evmTokenAddress = await bridge.methods.HathorToEvmTokenMap(hathorToken).call({ from: deployer });
  console.log(`EVM Token Address ${evmTokenAddress.tokenAddress} ${evmTokenAddress.originChainId}`);

  const hathorTokenAddress = await bridge.methods.EvmToHathorTokenMap(mainToken).call({ from: deployer });
  console.log(`Hathor Token Address ${hathorTokenAddress}`);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
