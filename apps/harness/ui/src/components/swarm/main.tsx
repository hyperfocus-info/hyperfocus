import { render } from "solid-js/web";
import "../../global-styles";
import { PublicSwarmPage } from "./public-swarm-page";
import { PublicConnectionsPage } from "../connections/public-connections-page";

const root=document.getElementById("root");
if(!root)throw new Error("Missing swarm page root.");
render(()=>location.pathname.startsWith("/connections")?<PublicConnectionsPage />:<PublicSwarmPage />,root);
