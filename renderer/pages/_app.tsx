import "../styles/globals.css";
import Head from "next/head";
import { AppProps } from "next/app";
import { Provider } from "jotai";
import "react-tooltip/dist/react-tooltip.css";
import { Toaster } from "@/components/ui/toaster";
import { Tooltip } from "react-tooltip";

const MyApp = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <Head>
        <title>Upscayl-Next</title>
      </Head>
      <base href="./" />

      <Provider>
        <Component {...pageProps} data-theme="upscayl" />
        <Toaster />
        <Tooltip
          className="z-[999] max-w-sm break-words !bg-secondary"
          id="tooltip"
        />
      </Provider>
    </>
  );
};

export default MyApp;
