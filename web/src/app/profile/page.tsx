import ProfilPage from '../profil/page';

/**
 * English alias for the Profil screen (UTA-73). `/profil` is canonical
 * (mockup language); `/profile` renders the same panel so bookmarks and
 * tests in either language land on the Story 25 UI.
 */
export const metadata = { title: 'Profile — TokoBoss' };

export default function ProfileAliasPage() {
  return <ProfilPage />;
}
