import * as React from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Web3 from "web3";
import { STATE_PARCEL_SELECTED } from "../Map";
import BN from "bn.js";
import { gql, useLazyQuery } from "@apollo/client";
import Image from "react-bootstrap/Image";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

const GeoWebCoordinate = require("js-geo-web-coordinate");

const MIN_DATE_MILLIS = 365 * 24 * 60 * 60 * 1000;
const MAX_DATE_MILLIS = 730 * 24 * 60 * 60 * 1000;

const newParcelQuery = gql`
  query LandParcel($id: String) {
    landParcel(id: $id) {
      id
    }
  }
`;

function ClaimAction({
  adminContract,
  account,
  claimBase1Coord,
  claimBase2Coord,
  setInteractionState,
  setSelectedParcelId,
  perSecondFeeNumerator,
  perSecondFeeDenominator,
}) {
  const [forSalePrice, setForSalePrice] = React.useState("");
  const [networkFeePayment, setNetworkFeePayment] = React.useState("");
  const [isActing, setIsActing] = React.useState(false);
  const [newParcelId, setNewParcelId] = React.useState(null);
  const [minInitialValue, setMinInitialValue] = React.useState(0);

  const spinner = (
    <div className="spinner-border" role="status">
      <span className="sr-only">Sending Transaction...</span>
    </div>
  );

  const [getNewParcel, { loading, data, stopPolling }] = useLazyQuery(
    newParcelQuery
  );

  let isForSalePriceInvalid =
    forSalePrice.length > 0 &&
    (isNaN(forSalePrice) || Number(forSalePrice) < minInitialValue);
  let isNetworkFeePaymentInvalid =
    networkFeePayment.length > 0 && isNaN(networkFeePayment);

  let newExpirationDate;
  let isDateInvalid = false;
  if (
    perSecondFeeNumerator &&
    perSecondFeeDenominator &&
    forSalePrice.length > 0 &&
    networkFeePayment.length > 0 &&
    !isForSalePriceInvalid &&
    !isNetworkFeePaymentInvalid
  ) {
    let perSecondFee = new BN(Web3.utils.toWei(forSalePrice))
      .mul(perSecondFeeNumerator)
      .div(perSecondFeeDenominator);

    let newFeeBalanceDuration = new BN(Web3.utils.toWei(networkFeePayment))
      .div(perSecondFee)
      .muln(1000);
    let now = new Date();
    newExpirationDate = new Date(
      now.getTime() + newFeeBalanceDuration.toNumber()
    );

    isDateInvalid =
      newFeeBalanceDuration < MIN_DATE_MILLIS ||
      newFeeBalanceDuration > MAX_DATE_MILLIS;
  }

  let isInvalid =
    isForSalePriceInvalid || isNetworkFeePaymentInvalid || isDateInvalid;

  React.useEffect(() => {
    if (data == null || data.landParcel == null) {
      return;
    }
    // Stop polling for new parcel
    stopPolling();

    // Load new parcel
    setSelectedParcelId(newParcelId);
    setInteractionState(STATE_PARCEL_SELECTED);
  }, [data]);

  React.useEffect(() => {
    if (adminContract == null) {
      return;
    }

    adminContract.methods
      .minInitialValue()
      .call()
      .then((minInitialValue) => {
        setMinInitialValue(Web3.utils.fromWei(minInitialValue));
      });
  }, [adminContract]);

  function _claim() {
    setIsActing(true);

    let baseCoord = GeoWebCoordinate.make_gw_coord(
      claimBase1Coord.x,
      claimBase1Coord.y
    );
    let destCoord = GeoWebCoordinate.make_gw_coord(
      claimBase2Coord.x,
      claimBase2Coord.y
    );
    let path = GeoWebCoordinate.make_rect_path(baseCoord, destCoord);
    if (path.length == 0) {
      path = [new BN(0)];
    }

    adminContract.methods
      .claim(
        account,
        baseCoord,
        path,
        Web3.utils.toWei(forSalePrice),
        Web3.utils.toWei(networkFeePayment)
      )
      .send({ from: account })
      .once("receipt", async function (receipt) {
        let licenseId =
          receipt.events["LicenseInfoUpdated"].returnValues._licenseId;
        let _newParcelId = `0x${new BN(licenseId, 10).toString(16)}`;
        setNewParcelId(_newParcelId);

        getNewParcel({
          variables: { id: _newParcelId },
          pollInterval: 2000,
        });

        setIsActing(false);
      })
      .catch(() => {
        setIsActing(false);
      });
  }

  return (
    <Card border="secondary" className="bg-dark mt-5">
      <Card.Body>
        <Card.Title className="text-primary font-weight-bold">Claim</Card.Title>
        <Card.Text>
          <Form>
            <Form.Group>
              <Form.Control
                required
                isInvalid={isForSalePriceInvalid}
                className="bg-dark text-light"
                type="text"
                placeholder="New For Sale Price (GEO)"
                aria-label="For Sale Price"
                aria-describedby="for-sale-price"
                disabled={isActing || loading}
                onChange={(e) => setForSalePrice(e.target.value)}
              />
              <Form.Control.Feedback type="invalid">
                For Sale Price must be greater than {minInitialValue}
              </Form.Control.Feedback>
              <br />
              <Form.Control
                required
                className="bg-dark text-light"
                type="text"
                placeholder="Network Fee Payment (GEO)"
                aria-label="Network Fee Payment"
                aria-describedby="network-fee-payment"
                disabled={isActing || loading}
                isInvalid={isNetworkFeePaymentInvalid || isDateInvalid}
                onChange={(e) => setNetworkFeePayment(e.target.value)}
              />
              <Form.Control.Feedback type="invalid">
                Initial payment must result in an expiration date between 1 and
                2 years from now
              </Form.Control.Feedback>
            </Form.Group>
            <Button
              variant="primary"
              className="w-100"
              onClick={_claim}
              disabled={
                !(forSalePrice && networkFeePayment) ||
                isActing ||
                loading ||
                isInvalid
              }
            >
              {isActing || loading ? spinner : "Confirm"}
            </Button>
          </Form>
          <br />
          <div className="font-weight-bold">New Expiration Date:</div>
          <div className={isDateInvalid ? "text-danger font-weight-bold" : ""}>
            {newExpirationDate ? newExpirationDate.toDateString() : "N/A"}
          </div>
        </Card.Text>
      </Card.Body>
      <Card.Footer className="border-top border-secondary">
        <Row>
          <Col sm="1">
            <Image src="notice.svg" />
          </Col>
          <Col className="font-italic">
            You will need to confirm this transaction in Metamask.
          </Col>
        </Row>
      </Card.Footer>
    </Card>
  );
}

export default ClaimAction;
