import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NetworkService {
    private isOnlineSubject = new BehaviorSubject<boolean>(true);
    readonly isOnline$ = this.isOnlineSubject.asObservable();

    async init(): Promise<void> {
        const status = await Network.getStatus();
        this.isOnlineSubject.next(status.connected);

        Network.addListener('networkStatusChange', (st) => {
            this.isOnlineSubject.next(st.connected);
        });
    }

    get isOnline(): boolean {
        return this.isOnlineSubject.value;
    }
}