terraform {
  required_version = ">= 1.7.0"

  # Production initialization must supply the existing bucket and prefix via
  # -backend-config. Local validation continues to use -backend=false.
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
