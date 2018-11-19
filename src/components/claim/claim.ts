/*
  Copyright (C) 2018-present evan GmbH.

  This program is free software: you can redistribute it and/or modify it
  under the terms of the GNU Affero General Public License, version 3,
  as published by the Free Software Foundation.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program. If not, see http://www.gnu.org/licenses/ or
  write to the Free Software Foundation, Inc., 51 Franklin Street,
  Fifth Floor, Boston, MA, 02110-1301 USA, or download the license from
  the following URL: https://evan.network/license/

  You can be released from the requirements of the GNU Affero General Public
  License by purchasing a commercial license.
  Buying such a license is mandatory as soon as you use this software or parts
  of it on other blockchains than evan.network.

  For more information, please contact evan GmbH at this address:
  https://evan.network/license/
*/

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DomSanitizer,
  ElementRef,
  EventEmitter,
  Input,
  MenuController,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from 'angular-libs';

import { AsyncComponent } from '../../classes/AsyncComponent';
import { EvanAddressBookService } from '../../services/bcc/address-book';
import { EvanBCCService } from '../../services/bcc/bcc';
import { EvanClaimService } from '../../services/bcc/claims';
import { EvanCoreService } from '../../services/bcc/core';
import { EvanQueue } from '../../services/bcc/queue';
import { EvanTranslationService } from '../../services/ui/translate';

/**************************************************************************************************/

/**
 * { function_description }
 *
 * @class      Component EvanClaimComponent
 */
@Component({
  selector: 'evan-claim',
  templateUrl: 'claim.html',
  animations: [ ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EvanClaimComponent extends AsyncComponent {
  /***************** inputs & outpus *****************/
  /**
   * address that for that the claims should be checked
   */
  @Input() address: string

  /**
   * the topic to load the claims for (/test/test2)
   */
  @Input() topic: string;

  /**
   * display mode that should be used (minimal, detail, full)
   */
  @Input() mode: string;

  /**
   * use computed view and only one claim instead of all possible ones (will display a small claim
   * count at the right of the card)
   */
  @Input() compute: boolean = true;

  /**
   * Are issue buttons are available? Not avaialble for icon mode
   */
  @Input() enableIssue: boolean;

  /*****************    variables    *****************/
  /**
   * available display modes
   */
  private availableModes = [
    'icon', // only circle that displays the icon
    'normal', // icon, displayname, creation date, sub claim count
    'detail', // normal + from / to, issued + valid until + status
  ];

  /**
   * All available claims for the given topic
   */
  private claims: Array<any> = [ { loading: true } ];
  
  /**
   * concadinated claim including computed status
   */
  private computed: any = { loading: true };

  /**
   * Are currently the claims loading?
   */
  private loadingClaims: boolean;

  /**
   * can a user issue a new claim (when no claim was issued before by the logged in user for the
   * selected topic and account)
   */
  private canIssueClaim: boolean;

  /**
   * Function to unsubscribe from queue results.
   */
  private queueWatcher: Function;

  /**
   * identity contract address of the current user
   */
  private activeIdentity: any;

  /**
   * activate the detail popup when a claim was clicked 
   */
  private activeClaims: any;

  /**
   * current addressbook contact
   */
  private addressbook: any;

  /***************** initialization  *****************/
  constructor(
    private _DomSanitizer: DomSanitizer,
    private addressBookService: EvanAddressBookService,
    private bcc: EvanBCCService,
    private claimService: EvanClaimService,
    private core: EvanCoreService,
    private element: ElementRef,
    private menuController: MenuController,
    private queue: EvanQueue,
    private translate: EvanTranslationService,
    public ref: ChangeDetectorRef,
  ) {
    super(ref);
  }

  /**
   * 
   */
  async _ngOnInit() {
    if (this.availableModes.indexOf(this.mode) === -1) {
      console.error(`EvanClaimComponent: ${ this.mode } is not a valid display mode.`);
      this.mode = 'normal';
    }

    // enable issue buttons when no values was provided and the display mode is not icon
    if (typeof this.enableIssue === 'undefined' && this.mode !== 'icon') {
      this.enableIssue = true;
    }

    // watch for any claim updates
    this.queueWatcher = await this.queue.onQueueFinish(
      this.claimService.getQueueId(),
      async (reload, results) => {
        this.loadClaims();
      }
    );
  }

  /**
   * 
   */
  async _ngOnDestroy() {
    this.queueWatcher();
  }

  /**
   * Load all claims for the current topic.
   *
   * @return     {Promise<void>}  resolved when done
   */
  private async loadClaims() {
    const activeAccount = this.core.activeAccount();

    this.loadingClaims = true;
    this.ref.detectChanges();

    // if identity could be loaded, extract the contract address
    this.activeIdentity = await this.bcc.claims.getIdentityForAccount(activeAccount);
    if (this.activeIdentity && this.activeIdentity.options) {
      this.activeIdentity = this.activeIdentity.options.address;
    } else {
      this.activeIdentity = null;
    }

    // load claims and the computed status to be able to display a combined view for all claims of a
    // specific topic
    this.claims = await this.claimService.getClaims(this.address, this.topic);
    this.addressbook = await this.addressBookService.loadAccounts();
    this.computed = this.claimService.getComputedClaim(this.topic, this.claims);
    this.canIssueClaim = this.claims.filter(claim => claim.issuer === this.activeIdentity)
      .length === 0;

    this.loadingClaims = false;
    this.ref.detectChanges();
  }

  /**
   * Issue a new claim the current opened topic and the subject.
   *
   * @param      {any}     claim   the claim for that the action should be triggerd
   * @param      {string}  type    type of the dispatcher (issueDispatcher, acceptDispatcher,
   *                               deleteDispatcher)
   */
  private triggerDispatcher(claim, type: string) {
    this.queue.addQueueData(
      this.claimService.getQueueId(type),
      {
        address: this.address,
        issuer: claim.issuerAccount,
        topic: claim.name,
      }
    );

    this.computed.loading = true;
    this.ref.detectChanges();
  }

  /**
   * Gets a claim
   *
   * @return     {<type>}  { description_of_the_return_value }
   */
  private activateClaim(claimToActivate: any) {
    this.activeClaims = [ ];

    // if no sub claims exists, it's only a single claim and we do not need solve the computed
    // one, else, we need to show multiple claims
    this.activeClaims = [ claimToActivate ];
    if (claimToActivate.claims) {
      this.activeClaims = claimToActivate.claims;
    }

    this.ref.detectChanges()
  }
}