module Hasura.RQL.Types.Network
  ( AddHostToTLSAllowlist,
    DropHostFromTLSAllowlist (..),
    Network (..),
    TlsAllow (..),
    TlsPermission (..),
    emptyNetwork,
  )
where

import Data.Aeson as A
import Data.Text qualified as T
import Hasura.Prelude

data Network = Network
  { networkTlsAllowlist :: [TlsAllow]
  }
  deriving (Show, Eq, Generic)

instance FromJSON Network where
  parseJSON = withObject "Network" $ \o -> Network <$> o .:? "tls_allowlist" .!= []

instance ToJSON Network where
  toJSON (Network t) = object ["tls_allowlist" A..= t]

emptyNetwork :: Network
emptyNetwork = Network []

data TlsAllow = TlsAllow
  { taHost :: String,
    taSuffix :: Maybe String,
    taPermit :: Maybe [TlsPermission]
  }
  deriving (Show, Read, Eq, Generic)

instance FromJSON TlsAllow where
  parseJSON j = aString j <|> anObject j
    where
      -- TODO: investigate if `withText` parser is needed anymore
      aString = withText "TlsAllow" $ \s ->
        if T.null s
          then fail "missing \"host\" field in input"
          else pure $ TlsAllow (T.unpack s) Nothing Nothing

      anObject = withObject "TlsAllow" $ \o ->
        TlsAllow
          <$> o .: "host"
          <*> o .:? "suffix"
          <*> o .:? "permissions"

instance ToJSON TlsAllow where
  toJSON (TlsAllow h p a) =
    object
      [ "host" A..= h,
        "suffix" A..= p,
        "permissions" A..= a
      ]

data TlsPermission
  = SelfSigned
  deriving (Show, Read, Eq, Generic, Enum, Bounded)

instance FromJSON TlsPermission where
  parseJSON (String "self-signed") = pure SelfSigned
  parseJSON _ =
    fail $
      "TlsPermission expecting one of " <> intercalate ", " (map (show :: TlsPermission -> String) [minBound .. maxBound])

instance ToJSON TlsPermission where
  toJSON SelfSigned = String "self-signed"

type AddHostToTLSAllowlist = TlsAllow

data DropHostFromTLSAllowlist = DropHostFromTLSAllowlist
  { dhftaHost :: String,
    dhftaSuffix :: Maybe String
  }
  deriving (Show, Eq)

instance FromJSON DropHostFromTLSAllowlist where
  parseJSON = withObject "DropHostFromTLSAllowlist" $ \o ->
    DropHostFromTLSAllowlist
      <$> o .: "host"
      <*> o .:? "suffix"

instance ToJSON DropHostFromTLSAllowlist where
  toJSON (DropHostFromTLSAllowlist h p) =
    object
      [ "host" A..= h,
        "suffix" A..= p
      ]
