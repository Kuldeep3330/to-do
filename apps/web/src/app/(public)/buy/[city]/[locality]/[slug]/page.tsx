import { ListingDetail, listingMetadata, type DetailParams } from '@/components/listing/listing-detail';

export const revalidate = 120;

type Props = { params: Promise<DetailParams> };

export const generateMetadata = ({ params }: Props) => listingMetadata(params);

export default function Page({ params }: Props) {
  return <ListingDetail intent="BUY" params={params} />;
}
