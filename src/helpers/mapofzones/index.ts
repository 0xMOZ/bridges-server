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
} from "./IBCTxsPage/__generated__/IBCTxsTable.query.generated";
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
  const variables = {};
  const data: DefillamaSupportedZonesQueryResult = await graphQLClient.request(DefillamaSupportedZonesDocument, variables);
  if (!data.flat_blockchains) {
    throw new Error("No zones found");
  }

  return data.flat_blockchains.map((zone) => ({
    zone_name: zone.name,
    zone_id: zone.network_id,
    zone_logo: zone.logo_url,
  }));
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

  let block;

  if (position === "First") {
    const data: DefillamaTxsFirstBlockQueryResult = await graphQLClient.request(
      DefillamaTxsFirstBlockDocument,
      variables
    );
    block = data.flat_defillama_txs_aggregate.aggregate?.min?.height;
  } else if (position === "Last") {
    const data: DefillamaTxsLastBlockQueryResult = await graphQLClient.request(DefillamaTxsLastBlockDocument, variables);
    block = data.flat_defillama_txs_aggregate.aggregate?.max?.height;
  }
  
  return block ? {
    block
  } :  undefined;

};

export const getZoneDataByBlock = async (
  zoneName: string,
  fromBlock: number,
  toBlock: number
): Promise<DefillamaTxsByBlockQueryResult> => {
  const variables = {
    blockchain: zoneName,
    from: fromBlock,
    to: toBlock,
  };
  const data = await graphQLClient.request(DefillamaTxsByBlockDocument, variables);
  return data;
};

export const getIbcVolumeByZoneId = (chainId: string) => {
  // @ts-ignore
  return async (fromBlock: number, toBlock: number) => {
    const zoneData = await getZoneDataByBlock(chainId, fromBlock, toBlock);
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
        } as EventData;
      }
    );
  };
};
