import { GraphQLClient } from "graphql-request";
import { EventData } from "../../utils/types";
import {
  DefillamaTxsByBlockDocument,
  DefillamaTxsByBlockQueryResult,
  DefillamaTxsLastBlockDocument,
  DefillamaTxsLastBlockQueryResult,
  DefillamaTxsFirstBlockDocument,
  DefillamaTxsFirstBlockQueryResult,
  DefillamaSupportedZonesQueryResult,
  DefillamaSupportedZonesDocument,
  DefillamaLatestBlockForZoneQueryResult,
  DefillamaLatestBlockForZoneDocument,
} from "./IBCTxsPage/__generated__/IBCTxsTable.query.generated";
import retry from "async-retry"

import { convertToUnixTimestamp } from "../../utils/date";
const endpoint = "https://api2.mapofzones.com/v1/graphql";
const graphQLClient = new GraphQLClient(endpoint);

export type ChainFromMapOfZones = {
  zone_name: string;
  zone_id: string;
  zone_logo?: string | null;
}

export const getSupportedChains = async (): Promise<
  ChainFromMapOfZones[]
> => {
  const data: DefillamaSupportedZonesQueryResult | undefined = await retry(async () => {
    const variables = {};
    return await graphQLClient.request(DefillamaSupportedZonesDocument, variables);
  }, {
    retries: 5,
    minTimeout: 5000,
    onRetry: (e, attempt) => {
      console.log(`Retrying ${attempt} for fetching supported chains`)
    }
  });
  
  if (!data) {
    throw new Error("No zones found");
  }

  if (!data.flat_blockchains) {
    throw new Error("No zones found");
  }

  return data.flat_blockchains.map((zone) => ({
    zone_name: zone.name,
    zone_id: zone.network_id,
    zone_logo: zone.logo_url,
  }));
}

export const getLatestBlockForZone = async (zoneId: string): Promise<{
  block: number;
  timestamp: number;
} | undefined> => {
  const variables = {
    blockchain: zoneId,
  };
  const block = await retry(async () => {
    try {
      const data: DefillamaLatestBlockForZoneQueryResult = await graphQLClient.request(DefillamaLatestBlockForZoneDocument, variables);
      return {
        block: data.flat_defillama_txs_aggregate.aggregate?.max?.height,
        timestamp: data.flat_defillama_txs_aggregate.aggregate?.max?.timestamp,
      };
    } catch(e) {
      console.log(`Error fetching latest block for ${zoneId}`)
      console.error(e);
      throw e;
    }
  }, {
    retries: 5,
    minTimeout: 5000,
    onRetry: (e, attempt) => {
      console.log(`Retrying ${attempt} for fetching latest block for ${zoneId}`)
    }
  });

  return block ? {
    block: block.block,
    timestamp: block.timestamp,
  } : undefined;
}

export const getBlockFromTimestamp = async (timestamp: number, chainId: string, position: "First" | "Last"): Promise<{
  block: number;
} | undefined> => {
  if (![ "First", "Last"].includes(position)) {
    throw new Error("Invalid position of block");
  }
  const date = new Date(timestamp * 1000);
  const variables = {
    blockchain: chainId,
    timestamp: date.toISOString(),
  };

  const block = await retry(async () => {
    try {
      if (position === "First") {
        const data: DefillamaTxsFirstBlockQueryResult = await graphQLClient.request(
          DefillamaTxsFirstBlockDocument,
          variables
        );
        return data.flat_defillama_txs_aggregate.aggregate?.min?.height;
      } else if (position === "Last") {
        const data: DefillamaTxsLastBlockQueryResult = await graphQLClient.request(DefillamaTxsLastBlockDocument, variables);
        return data.flat_defillama_txs_aggregate.aggregate?.max?.height;
      }
    } catch(e) {
      console.log(`Error fetching data for ${chainId} at ${position} block from ${timestamp}`)
      console.error(e);
      throw e;
    }
  }, {
    retries: 5,
    minTimeout: 5000,
    onRetry: (e, attempt) => {
      console.log(`Retrying ${attempt} for ${chainId} at ${position} block from ${timestamp}`)
    }
  });
  
  return block ? {
    block
  } :  undefined;

};

export const getZoneDataByBlock = async (
  zoneName: string,
  fromBlock: number,
  toBlock: number
): Promise<DefillamaTxsByBlockQueryResult | undefined> => {
  const variables = {
    blockchain: zoneName,
    from: fromBlock,
    to: toBlock,
  };
  
  return await retry(async () => {
    try {
      return await graphQLClient.request(DefillamaTxsByBlockDocument, variables);
    } catch(e) {
      console.log(`Error fetching data for ${zoneName} from block ${fromBlock} to ${toBlock}`)
      console.error(e);
      throw e;
    }
  }
  , {
    retries: 5,
    minTimeout: 5000,
    onRetry: (e, attempt) => {
      console.log(`Retrying ${attempt} for ${zoneName} from block ${fromBlock} to ${toBlock}`)
    }
  });
}

export const getIbcVolumeByZoneId = (chainId: string) => {
  // @ts-ignore
  return async (fromBlock: number, toBlock: number) => {

    let zoneData: DefillamaTxsByBlockQueryResult | undefined;

    zoneData = await getZoneDataByBlock(chainId, fromBlock, toBlock);

    if (!zoneData) {
      return [];
    }

    return zoneData.flat_defillama_txs.map(
      (tx: {
        destination_address: string;
        height: any;
        source_address: string;
        timestamp: any;
        tx_hash: string;
        tx_type: string;
        usd_value?: any | null;
        token?: { denom: string; logo_url?: string | null; symbol?: string | null } | null;
      }) => {
        let from = tx.source_address;
        let to = tx.destination_address;
        const isDeposit = tx.tx_type === "Deposit";

        if (isDeposit) {
          from = tx.destination_address;
          to = tx.source_address;
        }

        const timestamp = convertToUnixTimestamp(new Date(tx.timestamp)) * 1000; 
        
        return {  
          blockNumber: tx.height,
          txHash: tx.tx_hash,
          from,
          to,
          token: tx.token?.symbol || tx.token?.denom,
          amount: tx.usd_value,
          isDeposit,
          isUSDVolume: true,
          txsCountedAs: 1,
          timestamp,
        } as EventData;
      }
    );
  };
};
