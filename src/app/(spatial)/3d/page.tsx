import { ExplorerPage } from '../../../components/Explorer/ExplorerPage';
import { exhibitDocuments } from '../../../components/Explorer/exhibit-documents';
export default async function Page() { return <ExplorerPage chapters={await exhibitDocuments()} />; }
