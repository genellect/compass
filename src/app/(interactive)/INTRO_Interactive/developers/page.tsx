import { DeveloperApp } from "../../../../interactive/DeveloperApp";
import { engineeringMetadata } from "../../../../interactive/developer/EngineeringDocs";

export const metadata = engineeringMetadata();

export default function DevelopersPage() {
  return <DeveloperApp />;
}
