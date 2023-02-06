const { abi: erc20Abi } = require('./Splinters.json');
import {
    FlashbotsBundleProvider, FlashbotsBundleRawTransaction,
    FlashbotsBundleResolution,
    FlashbotsBundleTransaction
} from "@flashbots/ethers-provider-bundle";

import { BigNumber, providers, utils, Wallet, Contract } from "ethers";
import dotenv from "dotenv";
dotenv.config()

const FLASHBOTS_URL = 'https://relay-goerli.flashbots.net/';
const TOKEN_ADDRESS = "0x326C977E6efc84E512bB9C30f76E30c160eD06FB";
const CHAIN_ID = 5;

const PRIVATE_KEY_EXECUTOR = process.env.PRIVATE_KEY_EXECUTOR || "";
const PRIVATE_KEY_SPONSOR = process.env.PRIVATE_KEY_SPONSOR || "";

const main = async () => {
    if (process.env.PRIVATE_KEY_EXECUTOR === "" ||
        process.env.PRIVATE_KEY_SPONSOR === "") {
        console.warn("Must provide PRIVATE_KEY_EXECUTOR environment variable, corresponding to Ethereum EOA with assets to be transferred")
        process.exit(1)
    }



    // const provider = new providers.StaticJsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const provider = new providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);



    const authSigner = Wallet.createRandom()

    const flashBotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, FLASHBOTS_URL)

    const walletExecutor = new Wallet(PRIVATE_KEY_EXECUTOR).connect(provider);
    const walletSponsor = new Wallet(PRIVATE_KEY_SPONSOR).connect(provider);

    const abi = ["function transfer(address, uint256) external"];
    const functionInterface = new utils.Interface(abi)


    const contract = new Contract(TOKEN_ADDRESS, erc20Abi, provider);
    const totalBalance = ((await contract.balanceOf(walletExecutor.address)) / 10 ** 18).toString();
    // console.log({ balance }); return;

    provider.on("block", async (blockNumber) => {
        console.log({ blockNumber })
        const targetBlockNumber = blockNumber + 1;
        const bundleTransactions = [
            {
                signer: walletSponsor,
                transaction: {
                    chainId: CHAIN_ID,
                    type: 2,
                    to: walletExecutor.address,
                    value: utils.parseEther("0.01"),
                    maxFeePerGas: utils.parseUnits("70", "gwei"),
                    maxPriorityFeePerGas: utils.parseUnits("50", "gwei"),
                },
            },
            {
                signer: walletExecutor,
                transaction: {
                    chainId: CHAIN_ID,
                    type: 2,
                    to: TOKEN_ADDRESS,
                    gasLimit: "50000",
                    data: functionInterface.encodeFunctionData("transfer", [
                        walletSponsor.address,
                        utils.parseEther(totalBalance)
                    ]),
                    value: utils.parseEther("0.01"),
                    maxFeePerGas: utils.parseUnits("70", "gwei"),
                    maxPriorityFeePerGas: utils.parseUnits("50", "gwei"),
                },
            },

        ]



        const bundleResponse = await flashBotsProvider.sendBundle(bundleTransactions, targetBlockNumber);
        if ('error' in bundleResponse) {
            throw new Error(bundleResponse.error.message)
        }
        const bundleResolution = await bundleResponse.wait()
        if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
            console.log(`Congrats, included in ${targetBlockNumber}`)
            process.exit(0)
        } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
            console.log(`Not included in ${targetBlockNumber}`)
        } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
            console.log("Nonce too high, bailing")
            process.exit(1)
        }

    })

}
main()