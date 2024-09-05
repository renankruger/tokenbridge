
const { ethers, upgrades } = require("hardhat");

module.exports = async function (hre) { // HardhatRuntimeEnvironment
  const {getNamedAccounts, deployments} = hre;
  const {deployer} = await getNamedAccounts();
 
  

  const multiSigAddress = "";
  const members = [
    '0x5eb6ceca6bdd82f4a38aac0b957e6a4b5b1cceba',
    '0x8a9ec366c1b359fed1a7372cf8607ec52963b550',
    '0xa4398c6ff62e9b93b32b28dd29bd27c6b106245f',
    '0x1089a708b03821b19db9bdf179fbd7ed7ce591d7',
    '0x04237d65eb6cdc9f93db42fef53f7d5aaca2f1d6'
  ];


  const constructorArguments = [
    multiSigAddress,
    members
  ];

  console.log('constructorArguments', constructorArguments)

  const HathorTransactions = await ethers.getContractFactory("HathorFederation");
  const hathorTransactions = await upgrades.deployProxy(HathorTransactions, [constructorArguments]);
  await box.waitForDeployment();
  console.log("Hathor transactions deployed to:", await box.getAddress());
}
    
module.exports.id = 'deploy_hathorTransaction'; // id required to prevent reexecution
module.exports.tags = ['DeployHathorState'];
module.exports.dependencies = [
   'MultiSigWallet'
];
