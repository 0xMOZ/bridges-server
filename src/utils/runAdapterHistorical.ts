import { Chain } from "@defillama/sdk/build/general";
import bridgeNetworkData from "../data/bridgeNetworkData";
import { wait } from "../helpers/etherscan";
import { runAdapterHistorical } from "./adapter";
import { getBlockByTimestamp } from "./blocks";
import { newIBCBridgeNetwork } from "../adapters/ibc";

const startTs = Number(process.argv[2]);
const endTs = Number(process.argv[3]);
const bridgeName = process.argv[4];

async function fillAdapterHistorical(
  startTimestamp: number,
  endTimestamp: number,
  bridgeDbName: string,
  restrictChainTo?: string
) {
  if (!startTimestamp || !endTimestamp || !bridgeDbName) {
    console.error(
      "Missing parameters, please provide startTimestamp, endTimestamp and bridgeDbName. \nExample: npm run adapter 1704690402 1704949602 arbitrum"
    );
    process.exit();
  }

  let adapter = bridgeNetworkData.find((x) => x.bridgeDbName === bridgeDbName);
  if (!adapter) throw new Error("Invalid adapter");

  if(bridgeDbName === "ibc") {
    adapter = await newIBCBridgeNetwork(adapter);
  }

  for(const chain of adapter.chains) {
    console.log(`Running adapter from ${startTimestamp} to ${endTimestamp} for ${bridgeDbName} on ${chain}`)
    let nChain;
    if (adapter.chainMapping && adapter.chainMapping[chain.toLowerCase()]) {
      nChain = adapter.chainMapping[chain.toLowerCase()];
    } else {
      nChain = chain.toLowerCase();
    }
    if (restrictChainTo && nChain !== restrictChainTo) return;
    if (nChain === adapter?.destinationChain?.toLowerCase()) return;

    await wait(500);
    console.log("Getting start block")
    const startBlock = await getBlockByTimestamp(startTimestamp, nChain as Chain, adapter, "First");
    if (!startBlock) {
      console.error(`Could not find start block for ${chain} on ${bridgeDbName}`);
      continue;
    }
    console.log("Getting end block")
    const endBlock = await getBlockByTimestamp(endTimestamp, nChain as Chain, adapter, "Last");
    if (!endBlock) {
      console.error(`Could not find end block for ${chain} on ${bridgeDbName}`);
      continue;
    }

    await runAdapterHistorical(
      startBlock.block,
      endBlock.block,
      adapter,
      chain.toLowerCase(),
      true,
      false,
      "upsert"
    );
  }
  console.log(`Finished running adapter from ${startTimestamp} to ${endTimestamp} for ${bridgeDbName}`);
}

fillAdapterHistorical(startTs, endTs, bridgeName);
