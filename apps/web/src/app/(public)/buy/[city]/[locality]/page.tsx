import { AreaPage, areaMetadata } from '@/components/area/area-page';

export const revalidate = 300;

type Props = { params: Promise<{ city: string; locality: string }> };

export const generateMetadata = ({ params }: Props) => areaMetadata('BUY', params);

export default function Page({ params }: Props) {
  return <AreaPage intent="BUY" params={params} />;
}
