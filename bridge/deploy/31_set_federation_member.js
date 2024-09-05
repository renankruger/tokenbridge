module.exports = async function (hre) { // HardhatRuntimeEnvironment
  const {getNamedAccounts, deployments} = hre;
  const {deployer} = await getNamedAccounts();

  const MultiSigWallet = await deployments.getArtifact('MultiSigWallet');
  const Federation = await deployments.getArtifact('Federation');

  const federationAddress = "0x59604f34e1819c36273343F2259e760546a85886";
  const multiSigAddress = "0x9D7c899Cdb900B908864bE2A2991F3CbE9e6B71a"

  const multiSigContract = new web3.eth.Contract(MultiSigWallet.abi, multiSigAddress);
  const federationContract = new web3.eth.Contract(Federation.abi, federationAddress);

    const methodCallAddMember = federationContract.methods.addMember("0xCC3CF44397Daa4572CDb20f72dee5700507454E4");
    await methodCallAddMember.call({ from: multiSigAddress })
    await multiSigContract.methods.submitTransaction(federationAddress, 0, methodCallAddMember.encodeABI()).send({ from: deployer });
}

module.exports.id = 'set_federation_member'; // id required to prevent reexecution
module.exports.tags = ['DeployFromScratch'];
module.exports.dependencies = [
  'Bridge', 'Federation', 'MultiSigWallet'
];
