import { Beranda } from '@/components/shell/Beranda';

export const metadata = { title: 'Beranda — TokoBoss' };

/** Beranda home (UTA-113). Signed-out visitors are sent to /sign-in. */
export default function HomePage() {
  return <Beranda />;
}
