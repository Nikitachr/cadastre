import * as React from "react";
import Col from "react-bootstrap/Col";
import ClaimAction from "./cards/ClaimAction";
import ClaimInfo from "./cards/ClaimInfo";
import ParcelInfo from "./cards/ParcelInfo";
import { STATE, MapProps } from "./Map";
import { BigNumber, ethers } from "ethers";
import FairLaunchInfo from "./cards/FairLaunchInfo";
import { calculateRequiredBid } from "../lib/calculateRequiredBid";
import { truncateEth } from "../lib/truncate";

export type SidebarProps = MapProps & {
  interactionState: STATE;
  setInteractionState: React.Dispatch<React.SetStateAction<STATE>>;
  claimBase1Coord: any;
  claimBase2Coord: any;
  selectedParcelId: string;
  setSelectedParcelId: React.Dispatch<React.SetStateAction<string>>;
  setIsParcelAvailable: React.Dispatch<React.SetStateAction<boolean>>;
};

function Sidebar(props: SidebarProps) {
  const {
    auctionSuperApp,
    licenseContract,
    claimerContract,
    interactionState,
  } = props;

  const [perSecondFeeNumerator, setPerSecondFeeNumerator] =
    React.useState<BigNumber | null>(null);
  const [perSecondFeeDenominator, setPerSecondFeeDenominator] =
    React.useState<BigNumber | null>(null);

  React.useEffect(() => {
    auctionSuperApp.perSecondFeeNumerator().then((_perSecondFeeNumerator) => {
      setPerSecondFeeNumerator(_perSecondFeeNumerator);
    });
    auctionSuperApp
      .perSecondFeeDenominator()
      .then((_perSecondFeeDenominator) => {
        setPerSecondFeeDenominator(_perSecondFeeDenominator);
      });
  }, [auctionSuperApp]);

  const [startingBid, setStartingBid] = React.useState<BigNumber | null>(null);
  const [endingBid, setEndingBid] = React.useState<BigNumber | null>(null);
  const [auctionStart, setAuctionStart] =
    React.useState<BigNumber | null>(null);
  const [auctionEnd, setAuctionEnd] = React.useState<BigNumber | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      const [_startingBid, _endingBid, _auctionStart, _auctionEnd] =
        await Promise.all([
          claimerContract.startingBid(),
          claimerContract.endingBid(),
          claimerContract.auctionStart(),
          claimerContract.auctionEnd(),
        ]);
      if (_auctionStart.isZero() || _auctionEnd.isZero()) {
        return;
      }
      if (isMounted) {
        setStartingBid(_startingBid);
        setEndingBid(_endingBid);
        setAuctionStart(_auctionStart);
        setAuctionEnd(_auctionEnd);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [claimerContract]);

  const isFairLaunch =
    auctionStart &&
    auctionEnd &&
    startingBid &&
    endingBid &&
    Date.now() / 1000 < auctionEnd.toNumber();

  const requiredBid =
    auctionStart && auctionEnd && startingBid && endingBid
      ? calculateRequiredBid(auctionStart, auctionEnd, startingBid, endingBid)
      : BigNumber.from(0);

  return (
    <Col
      sm="3"
      className="bg-dark px-4 text-light"
      style={{ paddingTop: "120px", overflowY: "scroll", height: "100vh" }}
    >
      {isFairLaunch && interactionState == STATE.CLAIM_SELECTED ? (
        <FairLaunchInfo
          currentRequiredBid={truncateEth(
            ethers.utils.formatEther(requiredBid),
            4
          )}
          auctionEnd={auctionEnd.toNumber() * 1000}
          {...props}
        />
      ) : perSecondFeeNumerator && perSecondFeeDenominator ? (
        <ParcelInfo
          {...props}
          perSecondFeeNumerator={perSecondFeeNumerator}
          perSecondFeeDenominator={perSecondFeeDenominator}
          licenseAddress={licenseContract.address}
        ></ParcelInfo>
      ) : null}
      {interactionState == STATE.CLAIM_SELECTING ? <ClaimInfo /> : null}
      {interactionState == STATE.CLAIM_SELECTED &&
      perSecondFeeNumerator &&
      perSecondFeeDenominator ? (
        <>
          <ClaimAction
            {...props}
            isFairLaunch={isFairLaunch ?? undefined}
            perSecondFeeNumerator={perSecondFeeNumerator}
            perSecondFeeDenominator={perSecondFeeDenominator}
            licenseAddress={licenseContract.address}
            requiredBid={requiredBid}
          ></ClaimAction>
        </>
      ) : null}
    </Col>
  );
}

export default Sidebar;
