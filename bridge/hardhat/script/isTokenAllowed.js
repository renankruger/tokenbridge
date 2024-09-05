// How to run the script: npx hardhat run ./hardhat/script/isTokenAllowed.js --network mumbai
const hre = require("hardhat");
const address = require('../helper/address');

async function main() {
  const {deployments} = hre;
  const allowTokensProxyAddress = await address.getAllowTokensProxyAddress(hre);

  const allowedTokenAddr = "0xfb163D3CB9D63b547eEbc060BcC32EA22D5d2838"

  const AllowTokens = await deployments.getArtifact('AllowTokens');

  const allowTokensContract = new web3.eth.Contract(AllowTokens.abi, allowTokensProxyAddress);

  console.log("\nAllowTokens Proxy Contract", allowTokensProxyAddress);

  const infoAndLimits = await allowTokensContract.methods.getInfoAndLimits(allowedTokenAddr).call();
  const info = infoAndLimits.info;
  const limit = infoAndLimits.limit;
  console.log("isTokenAllowed", allowedTokenAddr, ":", info.allowed);
  console.log("info", info);
  console.log("limit", limit);

  console.log("finish");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
