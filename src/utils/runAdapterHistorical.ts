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

  const chunkSize = 20;
  const chunks = [];
  for (let i = 0; i < adapter.chains.length; i += chunkSize) {
    chunks.push(adapter.chains.slice(i, i + chunkSize));
  }
  
  for(let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const promises = chunk
    .map(async (chain, i) => {
      let nChain = chain.toLowerCase();
      if (adapter.chainMapping && adapter.chainMapping[chain.toLowerCase()]) {
        nChain = adapter.chainMapping[chain.toLowerCase()];
      }
      if (restrictChainTo && nChain !== restrictChainTo) return;
      if (nChain === adapter?.destinationChain?.toLowerCase()) return;

      await wait(500 * i);

      const startBlock = await getBlockByTimestamp(startTimestamp, chain as Chain, adapter, "First");
      if (!startBlock) {
        console.error(`Could not find start block for ${chain} on ${bridgeDbName}`);
        return;
      }
      const endBlock = await getBlockByTimestamp(endTimestamp, chain as Chain, adapter, "Last");
      if (!endBlock) {
        console.error(`Could not find end block for ${chain} on ${bridgeDbName}`);
        return;
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
    });

    await Promise.all(promises);
  }
  console.log(`Finished running adapter from ${startTimestamp} to ${endTimestamp} for ${bridgeDbName}`);
}

fillAdapterHistorical(startTs, endTs, bridgeName);
