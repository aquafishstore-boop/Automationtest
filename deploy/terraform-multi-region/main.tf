/**
 * Multi-Region Active-Passive Deployment
 * Primary: UK South, Secondary: UK West
 * Auto-failover via Azure Traffic Manager
 */

terraform {
  required_version = ">= 1.5"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}

provider "azurerm" {
  alias = "primary"
  features {}
}

provider "azurerm" {
  alias = "secondary"
  features {}
}

# Random suffix for globally unique names
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# Traffic Manager profile for failover routing
resource "azurerm_traffic_manager_profile" "main" {
  name                   = "uat-tm-${random_string.suffix.result}"
  resource_group_name    = var.resource_group_name
  location               = "global"
  traffic_routing_method = "Priority"

  dns_config {
    relative_name = "uat-tester-${random_string.suffix.result}"
    ttl           = 30
  }

  monitor_config {
    protocol                     = "HTTPS"
    port                         = 443
    path                         = "/api/scripts"
    interval_in_seconds          = 30
    timeout_in_seconds           = 10
    tolerated_number_of_failures = 3
  }
}

# Primary endpoint (priority 1)
resource "azurerm_traffic_manager_endpoint" "primary" {
  name                = "primary-uk-south"
  resource_group_name = var.resource_group_name
  profile_name        = azurerm_traffic_manager_profile.main.name
  type                = "azureEndpoints"
  target_resource_id  = module.primary.public_ip_id
  priority            = 1
}

# Secondary endpoint (priority 2, passive)
resource "azurerm_traffic_manager_endpoint" "secondary" {
  name                = "secondary-uk-west"
  resource_group_name = var.resource_group_name
  profile_name        = azurerm_traffic_manager_profile.main.name
  type                = "azureEndpoints"
  target_resource_id  = module.secondary.public_ip_id
  priority            = 2
}

# Primary region
module "primary" {
  source              = "./modules/uat-base"
  providers = {
    azurerm = azurerm.primary
  }
  location            = "UK South"
  resource_group_name = var.resource_group_name
  environment         = "primary"
  suffix              = random_string.suffix.result
  admin_username      = var.admin_username
  ssh_public_key      = var.ssh_public_key
  vnet_address_space  = ["10.0.0.0/16"]
  subnet_address_prefix = ["10.0.1.0/24"]
}

# Secondary region (passive, lower capacity)
module "secondary" {
  source              = "./modules/uat-base"
  providers = {
    azurerm = azurerm.secondary
  }
  location            = "UK West"
  resource_group_name = var.resource_group_name
  environment         = "secondary"
  suffix              = random_string.suffix.result
  admin_username      = var.admin_username
  ssh_public_key      = var.ssh_public_key
  vnet_address_space  = ["10.1.0.0/16"]
  subnet_address_prefix = ["10.1.1.0/24"]
}
