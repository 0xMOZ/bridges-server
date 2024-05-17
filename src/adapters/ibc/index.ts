import { BridgeNetwork } from "../../data/types";
import { BridgeAdapter } from "../../helpers/bridgeAdapter.type";
import { 
  ChainFromMapOfZones, 
  getBlockFromTimestamp, 
  getIbcVolumeByZoneId, 
  getSupportedChains,
  getLatestBlockForZone
} from "../../helpers/mapofzones";


export const getLatestBlockForZoneFromMoz = async (zoneId: string): Promise<{
  number: number;
  timestamp: number;
}> => {
  const block = await getLatestBlockForZone(zoneId);
  if (!block) {
    throw new LatestBlockNotFoundError(zoneId);
  }
  return {
    number: block.block,
    timestamp: block.timestamp,
  };
}

// this returns height only
export const getLatestBlockHeightForZoneFromMoz = async (zoneId: string): Promise<number> => {
  const block = await getLatestBlockForZone(zoneId);
  if (!block) {
    throw new LatestBlockNotFoundError(zoneId);
  }
  return block.block;
}

export const findChainId = (bridgeNetwork: BridgeNetwork, chain: string) => {
  if (bridgeNetwork.chainMapping === undefined) {
    throw new Error("Chain mapping is undefined for ibc bridge network.");
  }

  if (bridgeNetwork.chainMapping[chain]) {
    return bridgeNetwork.chainMapping[chain];
  } else if (Object.values(bridgeNetwork.chainMapping).includes(chain)) {
    return chain;
  }
}

export const newIBCBridgeNetwork = async(bridgeNetwork: BridgeNetwork) => {
  const chains = await supportedChainsFromMoz();

  bridgeNetwork.chains = chains.map((chain) => chain.zone_name.toLowerCase());
  const chainMapping: { [key: string]: string } = chains.reduce<{ [key: string]: string }>((acc, chain) => {
    acc[chain.zone_name.toLowerCase()] = chain.zone_id;
    return acc;
  }, {});

  bridgeNetwork.chainMapping = chainMapping;

  return bridgeNetwork;
}

export const ibcGetBlockFromTimestamp = async (bridge: BridgeNetwork, timestamp: number, chainName: string, position?: 'First' | 'Last') => {
  if(position === undefined) {
    throw new Error("Position is required for ibcGetBlockFromTimestamp");
  }
  const chainId = findChainId(bridge, chainName);
  if(chainId === undefined) {
    throw new Error(`Could not find chain id for chain name ${chainName}`);
  }
  return await getBlockFromTimestamp(timestamp, chainId, position);
}

export const excludedChains: string[] = []

export const supportedChainsFromMoz = async (): Promise<ChainFromMapOfZones[]> => {
  return getSupportedChains().then((chains) => {
    return chains.filter((chain) => [chain.zone_id, chain.zone_name.toLowerCase()].every((x) => !excludedChains.includes(x)));
  });
}

const chainExports = (ibcBridgeNetwork: BridgeNetwork) => {
  const chainNames = ibcBridgeNetwork.chains;

  const chainBreakdown = {} as BridgeAdapter;
  chainNames.forEach((chainName) => {
    const chainId = findChainId(ibcBridgeNetwork, chainName);
    if(chainId) {
      chainBreakdown[chainName.toLowerCase()] = getIbcVolumeByZoneId(chainId);
    }
  });
  return chainBreakdown;
};

const adapter: BridgeAdapter = {} as BridgeAdapter;

export const newIBCAdapter = (ibcBridgeNetwork: BridgeNetwork) => {
  if (ibcBridgeNetwork.chainMapping === undefined) {
    throw new Error("Chain mapping is undefined for ibc bridge network.");
  }

  return chainExports(ibcBridgeNetwork);
}

export default adapter;
